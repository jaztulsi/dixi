//
//  BrowserAgent.swift
//  BISV26
//
//  AI agent loop - orchestrates DOM-based browser actions via WebSocket or HTTP
//

import Foundation
import WebKit
import os.log

private let logger = Logger(subsystem: "com.bisv26.agent", category: "BrowserAgent")

// MARK: - Site Cache Protocol (implement later)

@MainActor
protocol SiteCache: AnyObject {
    func directURL(for task: String) -> String?
    func recordVisit(task: String, url: String)
}

// MARK: - Built-in Platform Shortcuts

enum PlatformShortcuts {
    static let promptSnippet = """
    Search URLs for named/obvious platforms ({q} = URL-encoded query): \
    youtube.com/results?search_query={q} | x.com/search?q={q} | reddit.com/search/?q={q} | \
    github.com/search?q={q} | amazon.com/s?k={q} | ebay.com/sch/i.html?_nkw={q} | \
    en.wikipedia.org/wiki/Special:Search?search={q} | google.com/maps/search/{q}
    """
}

@Observable
@MainActor
final class BrowserAgent {
    var isRunning = false
    var currentStep = 0
    var maxSteps = 15
    var taskDescription = ""
    var logEntries: [AgentLogEntry] = []
    var finalResult: String?
    var currentStatusLine: String = ""

    private let llm = LLMService()
    private var recentActions: [String] = []

    var tabManager: TabManager?
    var siteCache: SiteCache?

    var apiKey: String {
        get { llm.apiKey }
        set { llm.apiKey = newValue }
    }

    var apiBaseURL: String {
        get { llm.baseURL }
        set { llm.baseURL = newValue }
    }

    // MARK: - Public

    func start(task: String) async {
        guard let tabManager = tabManager, !isRunning else {
            logger.warning("start() called but agent is already running or tabManager is nil")
            return
        }

        guard !llm.apiKey.isEmpty else {
            logger.error("No API key configured")
            log(.error, "Set GROQ_API_KEY in .env first")
            return
        }

        isRunning = true
        currentStep = 0
        finalResult = nil
        taskDescription = task
        logEntries = []
        recentActions = []
        llm.onRateLimit = { [weak self] seconds in
            self?.currentStatusLine = "Groq rate limit, waiting \(seconds)s..."
            self?.log(.info, "Groq free-tier rate limit hit, waiting \(seconds)s")
        }

        logger.info("Agent starting task: \(task, privacy: .public)")
        currentStatusLine = "Starting: \(task)"
        log(.info, "Starting task: \(task)")

        // Navigate to a cached URL if available, otherwise let the model decide
        let currentURL = tabManager.getCurrentURL()
        if currentURL == "about:blank" || currentURL.isEmpty {
            if let cached = siteCache?.directURL(for: task) {
                let host = URL(string: cached)?.host ?? cached
                currentStatusLine = "Going to \(host)..."
                log(.action, "Cache → \(host)")
                await tabManager.navigate(to: cached)
            }
        }
        siteCache?.recordVisit(task: task, url: tabManager.getCurrentURL())

        await runAgentLoop(task: task, tabManager: tabManager)

        logger.info("Agent loop ended after \(self.currentStep, privacy: .public) steps")
        currentStatusLine = ""
        isRunning = false
    }

    /// Runs tasks one after another in the order they were spoken. `start` alone drops a task
    /// if the agent is busy, which loses follow-ups like "add this to cart... and that one too".
    func enqueue(task: String) async {
        let previous = queueTail
        let next = Task { await previous?.value; await self.start(task: task) }
        queueTail = next
        await next.value
    }
    private var queueTail: Task<Void, Never>?

    func stop() {
        logger.info("Agent stopped by user at step \(self.currentStep, privacy: .public)")
        isRunning = false
        currentStatusLine = ""
        log(.info, "Agent stopped by user")
    }

    // MARK: - Agent Loop (Groq)

    private func runAgentLoop(task: String, tabManager: TabManager) async {
        var messages: [[String: Any]] = []
        let systemPrompt = buildSystemPrompt(task: task)
        messages.append(["role": "system", "content": systemPrompt])

        var done = false
        // No-progress guards: the agent once clicked the same YouTube thumbnail 5 times in a row
        // while rate-limited. Same move on the same page 3 times, or 2 API failures in a row, ends it.
        var lastMove = "", sameMoveCount = 0, apiFailures = 0

        while currentStep < maxSteps && !done && isRunning {
            currentStep += 1
            logger.debug("=== Step \(self.currentStep, privacy: .public)/\(self.maxSteps, privacy: .public) ===")
            log(.info, "Step \(currentStep)")

            // Include screenshot only when agent appears stuck
            let needsScreenshot = isStuck
            if needsScreenshot { log(.info, "Agent appears stuck — attaching screenshot") }
            let (pageContent, elements) = await buildPageContent(tabManager: tabManager, includeScreenshot: needsScreenshot)
            messages.append(["role": "user", "content": pageContent])

            currentStatusLine = "Analyzing page..."
            log(.thinking, "Thinking...")

            let response: ChatCompletionResponse
            do {
                response = try await llm.chatCompletion(messages: messages)
            } catch {
                logger.error("API error: \(error.localizedDescription, privacy: .public)")
                log(.error, "API error: \(error.localizedDescription)")
                apiFailures += 1
                if apiFailures >= 2 {
                    currentStatusLine = "Stopped: AI unavailable right now"
                    log(.error, "Stopping after repeated API errors")
                    break
                }
                try? await Task.sleep(for: .seconds(2))
                continue
            }
            apiFailures = 0

            guard let assistantMsg = response.choices.first?.message else {
                log(.error, "No response from model")
                continue
            }

            // Add assistant message to history
            var assistantDict: [String: Any] = ["role": "assistant"]
            if let content = assistantMsg.content, let str = content.value as? String {
                assistantDict["content"] = str
            }
            if let toolCalls = assistantMsg.tool_calls {
                assistantDict["tool_calls"] = toolCalls.map { tc -> [String: Any] in
                    ["id": tc.id, "type": tc.type, "function": ["name": tc.function.name, "arguments": tc.function.arguments]]
                }
            }
            messages.append(assistantDict)

            if let toolCalls = assistantMsg.tool_calls, !toolCalls.isEmpty {
                for toolCall in toolCalls {
                    guard toolCall.type == "function" else { continue }
                    let fnName = toolCall.function.name
                    let fnArgs = toolCall.function.arguments

                    currentStatusLine = friendlyStatus(action: fnName, argsJSON: fnArgs, elements: elements)
                    logger.info("Tool call: \(fnName, privacy: .public) args: \(fnArgs, privacy: .public)")
                    log(.action, currentStatusLine)

                    if fnName == "done" {
                        if let args = try? JSONDecoder().decode(DoneArgs.self, from: Data(fnArgs.utf8)) {
                            finalResult = args.result
                            currentStatusLine = "Done"
                            log(.success, "Task complete!")
                            log(.info, args.result)
                        }
                        done = true
                        break
                    }

                    let move = "\(fnName)|\(fnArgs)|\(tabManager.getCurrentURL())"
                    sameMoveCount = move == lastMove ? sameMoveCount + 1 : 1
                    lastMove = move
                    if sameMoveCount >= 3 {
                        finalResult = "I couldn't get that to work: the same action wasn't changing anything."
                        currentStatusLine = "Stopped: no progress"
                        log(.error, "Stopping: same action 3 times with no effect")
                        done = true
                        break
                    }

                    let result = await executeAction(name: fnName, argsJSON: fnArgs, elements: elements, tabManager: tabManager)
                    log(.success, String(result.prefix(100)))
                    trackAction(fnName, result: result)
                    messages.append(["role": "tool", "tool_call_id": toolCall.id, "content": result])
                }
            } else if let content = assistantMsg.content, let str = content.value as? String {
                log(.thinking, "Model says: \(String(str.prefix(200)))")
            }
        }

        if currentStep >= maxSteps {
            log(.error, "Reached maximum steps (\(maxSteps)). Stopping.")
        }
    }

    // MARK: - Action Execution

    private func executeAction(
        name: String,
        argsJSON: String,
        elements: [InteractiveElement],
        tabManager: TabManager
    ) async -> String {
        let data = Data(argsJSON.utf8)

        switch name {
        case "click":
            guard let args = try? JSONDecoder().decode(ClickArgs.self, from: data) else {
                return "Error: invalid click args"
            }
            guard args.elementIndex >= 0, args.elementIndex < elements.count else {
                return "Error: element index \(args.elementIndex) out of range"
            }
            let el = elements[args.elementIndex]
            await tabManager.clickElement(at: el)
            return "Clicked element [\(args.elementIndex)] <\(el.tag)> '\(String(el.text.prefix(40)))'"

        case "type_text":
            guard let args = try? JSONDecoder().decode(TypeTextArgs.self, from: data) else {
                return "Error: invalid type_text args"
            }
            guard args.elementIndex >= 0, args.elementIndex < elements.count else {
                return "Error: element index \(args.elementIndex) out of range"
            }
            let el = elements[args.elementIndex]
            await tabManager.typeText(element: el, text: args.text, pressEnter: args.pressEnter)
            return "Typed '\(args.text)' into [\(args.elementIndex)]\(args.pressEnter ? " and pressed Enter" : "")"

        case "scroll":
            guard let args = try? JSONDecoder().decode(ScrollArgs.self, from: data) else {
                return "Error: invalid scroll args"
            }
            await tabManager.scrollPage(direction: args.direction, amount: args.amount)
            return "Scrolled \(args.direction) by \(Int(args.amount))px"

        case "navigate":
            guard let args = try? JSONDecoder().decode(NavigateArgs.self, from: data) else {
                return "Error: invalid navigate args"
            }
            await tabManager.navigate(to: args.url)
            return "Navigated to \(args.url)"

        case "wait":
            guard let args = try? JSONDecoder().decode(WaitArgs.self, from: data) else {
                return "Error: invalid wait args"
            }
            let timeout = min(args.seconds, 3)
            if let webView = tabManager.activeWebView, webView.isLoading {
                await tabManager.waitUntilLoaded(timeout: timeout)
                return "Waited for page to finish loading (up to \(Int(timeout))s)"
            } else {
                await tabManager.waitUntilSettled(timeout: timeout)
                return "Waited for page content to settle (up to \(Int(timeout))s)"
            }

        case "new_tab":
            guard let args = try? JSONDecoder().decode(NewTabArgs.self, from: data) else {
                return "Error: invalid new_tab args"
            }
            tabManager.createTab(url: args.url)
            await tabManager.navigate(to: args.url)
            return "Opened new tab: \(args.url)"

        case "switch_tab":
            guard let args = try? JSONDecoder().decode(SwitchTabArgs.self, from: data) else {
                return "Error: invalid switch_tab args"
            }
            if tabManager.switchToTab(index: args.tabIndex) {
                let url = tabManager.getCurrentURL()
                return "Switched to tab \(args.tabIndex): \(url)"
            } else {
                return "Error: tab index \(args.tabIndex) out of range (\(tabManager.tabs.count) tabs open)"
            }

        case "go_back":
            await tabManager.goBack()
            return "Navigated back"

        case "evaluate_js":
            guard let args = try? JSONDecoder().decode(EvaluateJSArgs.self, from: data) else {
                return "Error: invalid evaluate_js args"
            }
            let result = await tabManager.evaluateJS(code: args.code)
            return "JS result:\n\(String(result.prefix(2000)))"

        case "fork_tasks":
            guard let args = try? JSONDecoder().decode(ForkTasksArgs.self, from: data) else {
                return "Error: invalid fork_tasks args"
            }
            guard !args.tasks.isEmpty, args.tasks.count <= 5 else {
                return "Error: provide 1-5 tasks"
            }

            let savedActiveIndex = tabManager.activeTabIndex
            log(.info, "Forking \(args.tasks.count) sub-agents...")
            currentStatusLine = "Running \(args.tasks.count) parallel tasks..."

            // Create background tabs for each sub-task
            var subTasks: [(task: String, tabID: UUID)] = []
            for forkTask in args.tasks {
                let tab = tabManager.createBackgroundTab(url: forkTask.url)
                subTasks.append((task: forkTask.task, tabID: tab.id))
            }

            // Run all sub-agents concurrently
            let results = await withTaskGroup(of: (Int, String).self) { group in
                for (i, sub) in subTasks.enumerated() {
                    group.addTask {
                        let result = await self.runSubAgent(
                            task: sub.task,
                            tabID: sub.tabID,
                            tabManager: tabManager
                        )
                        return (i, result)
                    }
                }
                var collected: [(Int, String)] = []
                for await result in group {
                    collected.append(result)
                }
                return collected.sorted { $0.0 < $1.0 }
            }

            // Clean up sub-agent tabs
            for sub in subTasks {
                tabManager.closeTab(id: sub.tabID)
            }

            // Restore active tab
            tabManager.switchToTab(index: min(savedActiveIndex, tabManager.tabs.count - 1))

            let combined = results.map { i, result in
                "Sub-task \(i + 1) (\(args.tasks[i].task)):\n\(result)"
            }.joined(separator: "\n\n")

            log(.success, "All \(args.tasks.count) sub-agents completed")
            return combined

        default:
            return "Unknown action: \(name)"
        }
    }

    // MARK: - Sub-Agent

    private func runSubAgent(task: String, tabID: UUID, tabManager: TabManager) async -> String {
        // Wait for the background tab to load
        await tabManager.waitUntilLoaded(timeout: 10, tabID: tabID)

        var messages: [[String: Any]] = []
        let systemPrompt = """
        You are a focused browser sub-agent. You have a single task to complete on the page you've been given. \
        Complete the task efficiently and call done with your findings.

        Your task: \(task)

        Available actions: click, type_text, scroll, navigate, wait, go_back, evaluate_js, done.

        Strategy:
        - Analyze the element list and page title to understand the current page.
        - Use evaluate_js to read visible text or data from the page when needed.
        - Choose ONE action per turn.
        - When you have gathered the needed info, call done with a summary.
        - You have limited steps — be direct and efficient.
        """
        messages.append(["role": "system", "content": systemPrompt])

        let maxSubSteps = 10

        for _ in 0..<maxSubSteps {
            let (pageInfo, elements) = await buildPageInfoForTab(tabManager: tabManager, tabID: tabID)
            messages.append(["role": "user", "content": pageInfo])

            let response: ChatCompletionResponse
            do {
                response = try await llm.chatCompletion(messages: messages, tools: LLMService.subAgentTools)
            } catch {
                return "Error: \(error.localizedDescription)"
            }

            guard let assistantMsg = response.choices.first?.message else {
                return "Error: no response from model"
            }

            // Add assistant to history
            var assistantDict: [String: Any] = ["role": "assistant"]
            if let content = assistantMsg.content, let str = content.value as? String {
                assistantDict["content"] = str
            }
            if let toolCalls = assistantMsg.tool_calls {
                assistantDict["tool_calls"] = toolCalls.map { tc -> [String: Any] in
                    ["id": tc.id, "type": tc.type, "function": ["name": tc.function.name, "arguments": tc.function.arguments]]
                }
            }
            messages.append(assistantDict)

            guard let toolCalls = assistantMsg.tool_calls, !toolCalls.isEmpty else {
                if let content = assistantMsg.content, let str = content.value as? String {
                    return str
                }
                continue
            }

            for toolCall in toolCalls {
                guard toolCall.type == "function" else { continue }
                let fnName = toolCall.function.name
                let fnArgs = toolCall.function.arguments

                if fnName == "done" {
                    if let doneArgs = try? JSONDecoder().decode(DoneArgs.self, from: Data(fnArgs.utf8)) {
                        return doneArgs.result
                    }
                    return "(sub-agent completed)"
                }

                let result = await executeActionForTab(
                    name: fnName, argsJSON: fnArgs, elements: elements,
                    tabManager: tabManager, tabID: tabID
                )
                messages.append(["role": "tool", "tool_call_id": toolCall.id, "content": result])
            }
        }

        return "(sub-agent reached step limit without completing)"
    }

    private func executeActionForTab(
        name: String, argsJSON: String, elements: [InteractiveElement],
        tabManager: TabManager, tabID: UUID
    ) async -> String {
        let data = Data(argsJSON.utf8)

        switch name {
        case "click":
            guard let args = try? JSONDecoder().decode(ClickArgs.self, from: data) else { return "Error: invalid click args" }
            guard args.elementIndex >= 0, args.elementIndex < elements.count else { return "Error: element index out of range" }
            let el = elements[args.elementIndex]
            await tabManager.clickElement(at: el, tabID: tabID)
            return "Clicked [\(args.elementIndex)] <\(el.tag)> '\(String(el.text.prefix(40)))'"

        case "type_text":
            guard let args = try? JSONDecoder().decode(TypeTextArgs.self, from: data) else { return "Error: invalid type_text args" }
            guard args.elementIndex >= 0, args.elementIndex < elements.count else { return "Error: element index out of range" }
            let el = elements[args.elementIndex]
            await tabManager.typeText(element: el, text: args.text, pressEnter: args.pressEnter, tabID: tabID)
            return "Typed '\(args.text)' into [\(args.elementIndex)]"

        case "scroll":
            guard let args = try? JSONDecoder().decode(ScrollArgs.self, from: data) else { return "Error: invalid scroll args" }
            await tabManager.scrollPage(direction: args.direction, amount: args.amount, tabID: tabID)
            return "Scrolled \(args.direction) by \(Int(args.amount))px"

        case "navigate":
            guard let args = try? JSONDecoder().decode(NavigateArgs.self, from: data) else { return "Error: invalid navigate args" }
            await tabManager.navigate(to: args.url, tabID: tabID)
            return "Navigated to \(args.url)"

        case "wait":
            guard let args = try? JSONDecoder().decode(WaitArgs.self, from: data) else { return "Error: invalid wait args" }
            let timeout = min(args.seconds, 3)
            if let webView = tabManager.webView(for: tabID), webView.isLoading {
                await tabManager.waitUntilLoaded(timeout: timeout, tabID: tabID)
            } else {
                await tabManager.waitUntilSettled(timeout: timeout, tabID: tabID)
            }
            return "Waited for page (up to \(Int(timeout))s)"

        case "go_back":
            await tabManager.goBack(tabID: tabID)
            return "Navigated back"

        case "evaluate_js":
            guard let args = try? JSONDecoder().decode(EvaluateJSArgs.self, from: data) else { return "Error: invalid evaluate_js args" }
            let result = await tabManager.evaluateJS(code: args.code, tabID: tabID)
            return "JS result:\n\(String(result.prefix(2000)))"

        default:
            return "Unknown action: \(name)"
        }
    }

    private func buildPageInfoForTab(tabManager: TabManager, tabID: UUID) async -> (String, [InteractiveElement]) {
        let elements = await tabManager.extractInteractiveElements(tabID: tabID)
        let currentURL = tabManager.getCurrentURL(tabID: tabID)
        let pageTitle = await tabManager.getPageTitle(tabID: tabID)

        let elementsText = Self.compactElementList(elements)

        let pageInfo = """
        Current URL: \(currentURL)
        Page title: \(pageTitle)

        Interactive elements:
        \(elementsText.isEmpty ? "(none found)" : elementsText)
        """

        return (pageInfo, elements)
    }

    /// The page snapshot is the biggest part of every request (~2k tokens for 60 elements), so cap
    /// the count and label length. Indices stay the real ones, so clicks still hit the right element.
    static func compactElementList(_ elements: [InteractiveElement]) -> String {
        let shown = elements.prefix(50).map { e in "[\(e.index)] <\(e.tag)> '\(e.label.prefix(50))'" }
        let more = elements.count > 50 ? "\n(\(elements.count - 50) more below; scroll to see them)" : ""
        return shown.joined(separator: "\n") + more
    }

    // MARK: - System Prompt

    private func buildSystemPrompt(task: String) -> String {
        """
        You are a browser agent: the user's hands. Do EXACTLY the task, nothing more, then call done.
        Each turn you get the URL, title and indexed interactive elements (plus a screenshot if stuck).

        Task: \(task)

        \(PlatformShortcuts.promptSnippet)

        Scope (never violate): do only the verb used.
        - FIND/SEARCH → show results, done. Never open a result, add to cart or buy.
        - CLICK X → click it, done. Never click buy/cart/checkout/subscribe/confirm afterward.
        - OPEN site → navigate, done.
        - BUY/ADD TO CART → only then click transactional buttons.

        Strategy: if the current URL is unrelated, navigate. Named site → go directly; otherwise \
        google.com/search?q=... One action per turn, exact indices. New-tab links → switch_tab. \
        Scroll 500-800px. Loading → wait. Stuck → scroll or try another route. \
        fork_tasks for independent multi-site lookups. Max \(maxSteps) steps.
        """
    }

    // MARK: - Helpers

    private func buildPageInfo(tabManager: TabManager) async -> (String, [InteractiveElement]) {
        let elements = await tabManager.extractInteractiveElements()
        logger.debug("Found \(elements.count, privacy: .public) interactive elements")
        log(.info, "Found \(elements.count) interactive elements")

        let currentURL = tabManager.getCurrentURL()
        let pageTitle = await tabManager.getPageTitle()
        let tabList = tabManager.getTabList()

        let elementsText = Self.compactElementList(elements)

        let pageInfo = """
        Current URL: \(currentURL)
        Page title: \(pageTitle)
        Open tabs: \(tabList)

        Interactive elements:
        \(elementsText.isEmpty ? "(none found)" : elementsText)
        """

        return (pageInfo, elements)
    }

    /// Builds a multimodal content array (text + optional screenshot) for the vision model.
    /// Screenshots are only included when `includeScreenshot` is true (i.e. agent appears stuck).
    private func buildPageContent(tabManager: TabManager, includeScreenshot: Bool) async -> ([[String: Any]], [InteractiveElement]) {
        let (pageInfo, elements) = await buildPageInfo(tabManager: tabManager)

        var content: [[String: Any]] = [
            ["type": "text", "text": pageInfo]
        ]

        if includeScreenshot, let screenshotData = await tabManager.takeScreenshot() {
            let base64 = screenshotData.base64EncodedString()
            content.append([
                "type": "image_url",
                "image_url": [
                    "url": "data:image/jpeg;base64,\(base64)",
                    "detail": "low"
                ] as [String: String]
            ])
            logger.debug("Attached screenshot (\(screenshotData.count, privacy: .public) bytes)")
        }

        return (content, elements)
    }

    /// Returns true if the last 3+ actions are all scrolls or produced errors/unknowns,
    /// indicating the agent is stuck and needs visual context.
    private var isStuck: Bool {
        guard recentActions.count >= 3 else { return false }
        let last3 = recentActions.suffix(3)
        return last3.allSatisfy { action in
            action == "scroll" || action.contains("no element found") || action.contains("Error") || action == "unknown"
        }
    }

    private func trackAction(_ name: String, result: String) {
        let entry = result.contains("no element found") || result.contains("Error") ? result : name
        recentActions.append(entry)
        if recentActions.count > 5 { recentActions.removeFirst() }
    }

    private func friendlyStatus(action: String, argsJSON: String, elements: [InteractiveElement]) -> String {
        let data = Data(argsJSON.utf8)
        switch action {
        case "click":
            if let args = try? JSONDecoder().decode(ClickArgs.self, from: data),
               args.elementIndex >= 0, args.elementIndex < elements.count {
                return "Clicking \"\(String(elements[args.elementIndex].label.prefix(40)))\""
            }
            return "Clicking element..."
        case "type_text":
            if let args = try? JSONDecoder().decode(TypeTextArgs.self, from: data) {
                return "Typing \"\(String(args.text.prefix(30)))\"\(args.pressEnter ? " + Enter" : "")"
            }
            return "Typing text..."
        case "scroll":
            if let args = try? JSONDecoder().decode(ScrollArgs.self, from: data) {
                return "Scrolling \(args.direction)..."
            }
            return "Scrolling..."
        case "navigate":
            if let args = try? JSONDecoder().decode(NavigateArgs.self, from: data) {
                return "Going to \(String((URL(string: args.url)?.host ?? args.url).prefix(40)))"
            }
            return "Navigating..."
        case "wait": return "Waiting for page..."
        case "new_tab":
            if let args = try? JSONDecoder().decode(NewTabArgs.self, from: data) {
                return "Opening \(String((URL(string: args.url)?.host ?? args.url).prefix(40))) in new tab"
            }
            return "Opening new tab..."
        case "switch_tab": return "Switching tab..."
        case "go_back": return "Going back..."
        case "evaluate_js": return "Reading page data..."
        case "fork_tasks":
            if let args = try? JSONDecoder().decode(ForkTasksArgs.self, from: data) {
                return "Forking \(args.tasks.count) parallel tasks..."
            }
            return "Forking tasks..."
        case "done": return "Done"
        default: return action
        }
    }

    private func log(_ kind: AgentLogEntry.Kind, _ message: String) {
        logEntries.append(AgentLogEntry(kind: kind, message: message))
    }

}

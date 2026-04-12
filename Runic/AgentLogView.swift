//
//  AgentLogView.swift
//  BISV26
//
//  Created by Zack Gozelski on 3/14/26.
//

import SwiftUI


// MARK: - AgentLogPanelView

struct AgentLogPanelView: View {
    var agent: BrowserAgent
    @Binding var showSettings: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Circle()
                    .fill(
                        agent.isRunning
                            ? Color.green : Color.secondary.opacity(0.3)
                    )
                    .frame(width: 8, height: 8)

                Text("Agent")
                    .font(.system(size: 13, weight: .semibold))

                if agent.isRunning {
                    Text("Step \(agent.currentStep)/\(agent.maxSteps)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        agent.stop()
                    } label: {
                        Text("Stop")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.red)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(.red.opacity(0.1), in: Capsule())
                    }
                    .buttonStyle(.plain)
                } else {
                    Spacer()
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            Divider()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 3) {
                        ForEach(agent.logEntries) { entry in
                            LogRowView(entry: entry).id(entry.id)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .onChange(of: agent.logEntries.count) {
                    if let last = agent.logEntries.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            if let result = agent.finalResult {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Result", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.green)
                    Text(result)
                        .font(.system(size: 12))
                        .textSelection(.enabled)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    .green.opacity(0.06),
                    in: RoundedRectangle(cornerRadius: 10)
                )
                .padding(.horizontal, 10)
                .padding(.bottom, 8)
            }
        }
    }
}


// MARK: - LogRowView

struct LogRowView: View {
    let entry: AgentLogEntry

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Group {
                switch entry.kind {
                case .action:
                    Image(systemName: "play.circle.fill").foregroundStyle(.blue)
                case .success:
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(
                        .green
                    )
                case .error:
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
                case .thinking:
                    Image(systemName: "brain").foregroundStyle(.orange)
                case .info:
                    Image(systemName: "circle.fill").foregroundStyle(
                        .quaternary
                    )
                }
            }
            .font(.system(size: 9))
            .frame(width: 12)

            Text(entry.message)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(
                    entry.kind == .error
                        ? .red : entry.kind == .success ? .green : .primary
                )
                .textSelection(.enabled)
        }
    }
}

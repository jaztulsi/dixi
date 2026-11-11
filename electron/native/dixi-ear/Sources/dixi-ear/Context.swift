import AppKit
import ApplicationServices

/// What is in front when the talk key goes down: the app, its window title, whether the cursor is in a text field,
/// and how much text is selected (the length only, never the text). Read off the main thread with a short
/// Accessibility timeout, so a hung app never delays the key tap.
enum Context {
  private static let queue = DispatchQueue(label: "dixi.ear.context", qos: .userInitiated)
  private static let editable: Set<String> = ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]

  static func snapshot() {
    queue.async {
      guard let app = NSWorkspace.shared.frontmostApplication else { return }
      var m: [String: Any] = ["ev": "context", "app": app.localizedName ?? "", "bundle": app.bundleIdentifier ?? "", "pid": Int(app.processIdentifier)]
      if AXIsProcessTrusted() {
        let ax = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(ax, 0.25)
        if let win: AXUIElement = attr(ax, kAXFocusedWindowAttribute), let title: String = attr(win, kAXTitleAttribute) { m["title"] = String(title.prefix(200)) }
        if let el: AXUIElement = attr(ax, kAXFocusedUIElementAttribute) {
          AXUIElementSetMessagingTimeout(el, 0.25)
          let role: String = attr(el, kAXRoleAttribute) ?? ""
          var settable: DarwinBoolean = false
          let canSet = AXUIElementIsAttributeSettable(el, kAXValueAttribute as CFString, &settable) == .success && settable.boolValue
          m["role"] = role
          m["editable"] = editable.contains(role) || canSet
          if let sel: String = attr(el, kAXSelectedTextAttribute), !sel.isEmpty { m["selection"] = sel.count }
        }
      }
      Out.emit(m)
    }
  }

  private static func attr<T>(_ el: AXUIElement, _ name: String) -> T? {
    var v: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success, let v else { return nil }
    if T.self == AXUIElement.self { return CFGetTypeID(v) == AXUIElementGetTypeID() ? (v as! T) : nil }
    return v as? T
  }
}

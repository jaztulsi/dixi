import AppKit
import ApplicationServices
import CoreGraphics

/// The global key tap. It reports only *kinds* of key events (fn_down, fn_up, space, esc, other_key, ctrl), never
/// which key you typed. Fn is read only from flagsChanged with keycode 63: macOS also sets the Fn flag on arrows,
/// F-keys, Home/End and Forward Delete, so the flag on a keyDown never means Fn was pressed.
final class Keys {
  static let shared = Keys()
  enum Trigger: String { case fn, ctrlopt, both }

  var trigger: Trigger = .fn
  var onDown: () -> Void = {}            // the mic starts here, before anything else
  var recording: () -> Bool = { false }  // hands-free: Esc still counts with no key held

  private var tap: CFMachPort?
  private(set) var held = false          // the talk key (Fn, or Ctrl+Option) is down
  private var fnDown = false, comboDown = false

  private static let kFn: Int64 = 63, kSpace: Int64 = 49, kEsc: Int64 = 53
  private static let kCtrl: Set<Int64> = [59, 62]

  /// Creates the tap; without Input Monitoring / Accessibility it can't, so it asks once and tries again every 3 s.
  func start() {
    if install() { return }
    if !CGPreflightListenEventAccess() { _ = CGRequestListenEventAccess() }
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(opts)
    Out.error("keys", "No key access yet: allow Dixi in System Settings → Privacy & Security → Input Monitoring and Accessibility.")
    Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { timer in
      if self.install() { timer.invalidate(); Out.emit(["ev": "keys", "ok": true]) }
    }
  }

  private func install() -> Bool {
    let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)
    guard let t = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
                                    eventsOfInterest: CGEventMask(mask), callback: keysCallback, userInfo: nil) else { return false }
    tap = t
    let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
    CGEvent.tapEnable(tap: t, enable: true)
    fnDown = NSEvent.modifierFlags.contains(.function)   // a key already held sends no flagsChanged
    return true
  }

  private func key(_ type: String, _ event: CGEvent?, ctrl: Bool = false) {
    let t = event.map { Double($0.timestamp) / 1e6 } ?? Out.nowMs()
    var m: [String: Any] = ["ev": "key", "type": type, "t": t]
    if ctrl { m["ctrl"] = true }
    Out.emit(m)
  }

  private func setHeld(_ down: Bool, _ event: CGEvent?, ctrl: Bool) {
    guard down != held else { return }
    held = down
    if down { onDown() }
    key(down ? "fn_down" : "fn_up", event, ctrl: ctrl)
  }

  func handle(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
      if let t = tap { CGEvent.tapEnable(tap: t, enable: true) }
      let now = NSEvent.modifierFlags.contains(.function)
      if fnDown && !now { fnDown = false; if trigger != .ctrlopt { setHeld(comboDown, nil, ctrl: false) } }
      return Unmanaged.passUnretained(event)

    case .flagsChanged:
      let code = event.getIntegerValueField(.keyboardEventKeycode)
      let f = event.flags
      let ctrl = f.contains(.maskControl)
      if code == Keys.kFn && trigger != .ctrlopt {
        fnDown = f.contains(.maskSecondaryFn)
        setHeld(fnDown || comboDown, event, ctrl: ctrl)
      } else if trigger != .fn {
        let combo = ctrl && f.contains(.maskAlternate) && !f.contains(.maskCommand) && !f.contains(.maskShift)
        if combo != comboDown { comboDown = combo; setHeld(fnDown || comboDown, event, ctrl: false); return Unmanaged.passUnretained(event) }
      }
      if held && fnDown && Keys.kCtrl.contains(code) && ctrl { key("ctrl", event) }   // Fn then Control: dictation
      return Unmanaged.passUnretained(event)

    case .keyDown:
      let code = event.getIntegerValueField(.keyboardEventKeycode)
      if code == Keys.kEsc && (held || recording()) { key("esc", event); return Unmanaged.passUnretained(event) }
      guard held else { return Unmanaged.passUnretained(event) }
      if code == Keys.kSpace {
        if event.getIntegerValueField(.keyboardEventAutorepeat) == 0 { key("space", event) }
        return nil   // Fn+Space never types a space
      }
      key("other_key", event)   // Fn+arrow, Fn+F-key, Fn+Delete…: you're using Fn normally
      return Unmanaged.passUnretained(event)

    case .keyUp:
      if held && event.getIntegerValueField(.keyboardEventKeycode) == Keys.kSpace { return nil }
      return Unmanaged.passUnretained(event)

    default:
      return Unmanaged.passUnretained(event)
    }
  }
}

/// A C callback can't capture anything, so it goes through the singleton.
private func keysCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
  Keys.shared.handle(type, event)
}

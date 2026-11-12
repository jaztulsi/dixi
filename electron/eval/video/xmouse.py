# The real X11 pointer, moved like a hand (smooth, eased): reads "x0 y0 x1 y1 ms" lines, answers "ok" when there.
# Used by eval/shop-video.mjs under Xvfb, so the screen recording shows a real cursor and "this" is what it's on.
import ctypes, sys, time
x = ctypes.cdll.LoadLibrary('libX11.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XWarpPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_int, ctypes.c_int]
x.XFlush.argtypes = [ctypes.c_void_p]
d = x.XOpenDisplay(None)
root = x.XDefaultRootWindow(d)
for line in sys.stdin:
    try:
        x0, y0, x1, y1, ms = map(float, line.split())
    except ValueError:
        continue
    n = max(1, int(ms / 16))
    for i in range(1, n + 1):
        t = i / n
        e = t * t * (3 - 2 * t)
        x.XWarpPointer(d, 0, root, 0, 0, 0, 0, int(x0 + (x1 - x0) * e), int(y0 + (y1 - y0) * e))
        x.XFlush(d)
        time.sleep(ms / 1000 / n)
    print('ok', flush=True)

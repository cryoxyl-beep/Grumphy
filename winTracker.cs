using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class Program {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

    public static string GetCurrentForegroundJson() {
        try {
            SetProcessDpiAwarenessContext((IntPtr)(-4));
        } catch {}

        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return "null";

        if (IsIconic(hwnd)) return "null";

        StringBuilder sb = new StringBuilder(512);
        GetWindowText(hwnd, sb, 512);
        string title = sb.ToString().Trim();
        if (string.IsNullOrEmpty(title)) return "null";

        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);

        RECT rect;
        int res = DwmGetWindowAttribute(hwnd, 9, out rect, Marshal.SizeOf(typeof(RECT)));
        if (res != 0) {
            if (!GetWindowRect(hwnd, out rect)) return "null";
        }

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 50 || height <= 50 || rect.Left <= -30000 || rect.Top <= -30000) return "null";

        string cleanTitle = title.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");

        return "{\"title\":\"" + cleanTitle + "\",\"processId\":" + pid + ",\"bounds\":{\"x\":" + rect.Left + ",\"y\":" + rect.Top + ",\"width\":" + width + ",\"height\":" + height + "}}";
    }

    public static void Main(string[] args) {
        try {
            SetProcessDpiAwarenessContext((IntPtr)(-4));
        } catch {}

        Console.OutputEncoding = Encoding.UTF8;
        if (args.Length > 0 && args[0] == "--once") {
            Console.WriteLine(GetCurrentForegroundJson());
            return;
        }

        while (true) {
            try {
                string json = GetCurrentForegroundJson();
                Console.WriteLine(json);
            } catch {
                Console.WriteLine("null");
            }
            Thread.Sleep(1200);
        }
    }
}

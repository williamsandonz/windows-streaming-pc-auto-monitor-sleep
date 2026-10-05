# Prints Windows' display power state each time it changes, one line per change:
#
#   state <on|off|dimmed> <milliseconds since the last keyboard or mouse input>
#
# Windows also reports the current state straight after registering, so the first
# line is the state at start-up. Used by the Node program to check that "monitor off"
# took effect and stayed in effect. Exits by itself after -Seconds.
param([int]$Seconds = 120)

Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class DisplayStateWatcher : NativeWindow
{
    const int WM_POWERBROADCAST = 0x218;
    const int PBT_POWERSETTINGCHANGE = 0x8013;
    static readonly IntPtr HWND_MESSAGE = new IntPtr(-3);
    static Guid GUID_CONSOLE_DISPLAY_STATE = new Guid("6fe69556-704a-47a0-8f24-c28d936fda47");

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr RegisterPowerSettingNotification(IntPtr recipient, ref Guid powerSetting, int flags);

    [StructLayout(LayoutKind.Sequential)]
    struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

    [DllImport("user32.dll")]
    static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    static uint IdleMs()
    {
        LASTINPUTINFO info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        GetLastInputInfo(ref info);
        return (uint)Environment.TickCount - info.dwTime;
    }

    DisplayStateWatcher()
    {
        CreateParams cp = new CreateParams();
        cp.Parent = HWND_MESSAGE;
        CreateHandle(cp);

        if (RegisterPowerSettingNotification(Handle, ref GUID_CONSOLE_DISPLAY_STATE, 0) == IntPtr.Zero)
        {
            throw new InvalidOperationException("RegisterPowerSettingNotification failed, error " + Marshal.GetLastWin32Error());
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_POWERBROADCAST && m.WParam.ToInt64() == PBT_POWERSETTINGCHANGE)
        {
            // POWERBROADCAST_SETTING: a GUID (16 bytes), a DWORD length, then the data.
            int data = Marshal.ReadInt32(m.LParam, 20);
            string state = data == 0 ? "off" : (data == 1 ? "on" : "dimmed");
            Console.Out.WriteLine("state " + state + " " + IdleMs());
            Console.Out.Flush();
        }
        base.WndProc(ref m);
    }

    public static void Run(int seconds)
    {
        DisplayStateWatcher watcher = new DisplayStateWatcher();
        Timer stop = new Timer();
        stop.Interval = seconds * 1000;
        stop.Tick += delegate { Application.ExitThread(); };
        stop.Start();
        Application.Run();
        GC.KeepAlive(watcher);
    }
}
'@

[DisplayStateWatcher]::Run($Seconds)

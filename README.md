# Auto Monitor Sleep

A tiny Windows tool that switches off your physical monitor a few seconds after you log in, while the PC itself carries on running.

## Goals

- Protect the OLED panel from burn-in. After a Wake-on-LAN boot nobody is sitting at the desk, so the monitor should not sit on the desktop all day.
- Keep everything else awake. Docker, RDT-Client, Plex and Sunshine with the virtual display driver must not be affected.
- Need no manual steps. The PC boots, you are logged in, the screen goes dark by itself.
- Stay easy to undo. Moving the mouse, pressing a key or pressing the monitor's power button brings the display straight back.
- Stay small and simple. One job, no background service, no complicated settings.

This tool is not a screen saver or an idle timer. It runs once at login, does its job and exits. It does not put the PC to sleep and it does not keep the monitor off forever: any physical input wakes it, and it will not switch it off again until the next login.

## How it works

1. You log in to Windows. A Startup item or Scheduled Task starts this program.
2. The program waits a few seconds (5 by default). This gives Windows time to finish loading the graphics drivers and the virtual display driver, so the command is not sent too early.
3. It then runs a small free utility called NirCmd with the instruction `monitor off`.
4. Windows stops sending a picture to the physical monitor, and the monitor drops into standby. The PC, your services and any remote streaming carry on as normal.
5. The program prints what it did and closes.

NirCmd is a separate download by NirSoft. This project only runs it, so you need to supply `nircmd.exe` yourself (see step 3 below).

## What you need

- Windows 10 or 11.
- Node.js 20.12 or newer (check with `node -v`).
- `nircmd.exe` from NirSoft: https://www.nirsoft.net/utils/nircmd.html. Download it from NirSoft only. Some antivirus tools flag NirCmd because it can control Windows, so you may need to allow it.

## Setting it up

Run these on the Windows machine.

**1. Get the project onto the PC** and open a terminal (PowerShell or Command Prompt) in the `auto-monitor-sleep` folder.

**2. Install and build.**

```
npm install
npm run build
```

`npm install` downloads the tools needed to build the project. `npm run build` turns the TypeScript in `src/` into runnable JavaScript in `dist/`. You only need to repeat the build if you change the code.

**3. Add NirCmd.** Create a folder called `bin` inside the project and put `nircmd.exe` in it, so you end up with `bin\nircmd.exe`. If you would rather keep it elsewhere, set `NIRCMD_PATH` instead (see the settings below).

**4. Optional: create a `.env` file** in the project folder if you want to change any settings. It is a plain text file with one `NAME=value` per line. You do not need one if the defaults suit you.

**5. Test it safely, then for real** (next section).

**6. Make it run at login** (section after that).

## Settings

All settings are optional. Put them in `.env` in the project folder.

| Setting | Default | What it does |
| --- | --- | --- |
| `DELAY_SECONDS` | `5` | Seconds to wait after the program starts before switching the monitor off. Use `0` for no wait. Increase it if the monitor does not go off reliably. |
| `NIRCMD_PATH` | not set | Full path to `nircmd.exe`, for example `C:\Tools\nircmd.exe`. If not set, the program uses `bin\nircmd.exe` in the project, then falls back to any `nircmd.exe` on your PATH. |
| `DRY_RUN` | `false` | Set to `true` to print what would happen without touching the monitor. |

An example `.env`:

```
DELAY_SECONDS=8
NIRCMD_PATH=C:\Tools\nircmd.exe
```

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Downloads the build tools. Run once. |
| `npm run build` | Compiles the code into `dist/`. Run once, and again after any code change. |
| `npm start` | Runs the program (same as `node dist/index.js`). |

## Checking it works

**Dry run first.** Add `DRY_RUN=true` to `.env`, then run:

```
npm start
```

You should see two lines like this, and the monitor stays on:

```
2026-10-02T09:00:00.000Z Waiting 5s for the graphics and virtual display drivers to initialise.
2026-10-02T09:00:05.000Z DRY_RUN is on, not running: C:\...\bin\nircmd.exe monitor off
```

This confirms the program starts and has found NirCmd. Check the path in the second line is the `nircmd.exe` you expect.

**Then the real thing.** Remove the `DRY_RUN` line (or set it to `false`) and run `npm start` again. After the delay the monitor should go black, and the terminal should print `Display off sent, the physical monitor should now be in standby.` Move the mouse to wake the monitor.

**Finally, test at login.** Once you have set up the startup step below, restart the PC (or log out and in) and check the monitor goes dark by itself a few seconds after the desktop appears. Also confirm Plex, Docker and Sunshine are still reachable while the screen is off.

## Running it at login

Pick one.

**Startup folder (simplest).** Press `Win + R`, type `shell:startup` and press Enter. In that folder create a file called `monitor-sleep.cmd` containing the line below, with the path changed to where your project lives:

```
node "C:\path\to\auto-monitor-sleep\dist\index.js"
```

**Task Scheduler (more control).** Create a new task with these settings:

- Trigger: At log on, for your user.
- Action: Start a program. Program: `node`. Arguments: `dist\index.js`. Start in: the full path to the project folder.
- General: run only when you are logged on, so it runs in your desktop session. The monitor can only be switched off from a normal logged-in session.

Either way, the program finds `.env` and `bin\nircmd.exe` relative to the project, not the folder it was started from.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `NirCmd not found at ...` | Put `nircmd.exe` in `bin\`, or set `NIRCMD_PATH` to its full path. |
| `Monitor sleep is only implemented for Windows` | You ran it on a Mac or Linux machine. It only works on Windows. Set `DRY_RUN=true` if you just want to test the startup. |
| Nothing happens and no error | Raise `DELAY_SECONDS` (try 10) so the drivers have longer to start. Check the task runs as your logged-in user. |
| Monitor goes off then straight back on | Something is sending input, such as a mouse nudge or a remote session. Move the mouse away, increase the delay and test again. |
| Antivirus removes `nircmd.exe` | Restore it and add an exception, having confirmed it came from NirSoft. |

## Project layout

```
src/index.ts     Starts the program: wait, then switch the monitor off.
src/monitor.ts   Runs nircmd.exe with "monitor off".
src/config.ts    Reads the settings and finds nircmd.exe.
src/log.ts       Prints timestamped messages.
bin/             Your nircmd.exe goes here (not stored in git).
dist/            Built output (created by npm run build).
.env             Your optional settings (not stored in git).
```

# Vanta TUI demo — scripted with charmbracelet/vhs.
# Render from the repo root:  vhs assets/vanta-demo.tape
Output assets/vanta-demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 640
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type "clear" Enter
Show

Type "./run.sh" Enter
Sleep 6s
Type "how many TypeScript files are in vanta-ts/src? use the shell to count"
Sleep 800ms
Enter
Sleep 12s
Type "/exit" Enter
Sleep 2s

# Vanta v0.5.0 — autonomous-box demo → GIF.
# Record:  vhs scripts/demo-autonomous-box.tape   (produces demo-autonomous-box.gif)
# Needs:   vhs (`brew install vhs`) + Docker running. Pre-pull alpine first so the GIF stays clean:
#          docker pull alpine
Output demo-autonomous-box.gif

Require docker

Set Shell bash
Set FontSize 22
Set Width 1200
Set Height 660
Set Theme "Dracula"
Set Padding 28
Set TypingSpeed 35ms

Hide
Type "clear" Enter
Show
Sleep 400ms
Type "bash scripts/demo-autonomous-box.sh"
Sleep 600ms
Enter
Sleep 15s

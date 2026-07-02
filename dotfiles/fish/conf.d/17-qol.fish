# ABOUTME: Quality of life improvements for better man pages, clipboard, and Quick Look
# ABOUTME: Enhanced terminal experience with colored output and macOS integration

# Pretty man pages with bat
set -gx MANPAGER "sh -c 'col -bx | bat -l man -p'"

# Less: colors, mouse, and no history file
set -gx LESS '-R --mouse --wheel-lines=3'
set -gx LESSHISTFILE '-'

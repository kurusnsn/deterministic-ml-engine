#!/bin/zsh

# ==============================================================================
# Terminal Completion Sound
# ==============================================================================
# Source this file in your ~/.zshrc or runs it in your current session:
# source scripts/add-terminal-sound.sh
# ==============================================================================

# Configuration
NOTIFY_THRESHOLD=5  # Seconds
NOTIFY_SOUND="/System/Library/Sounds/Glass.aiff" # Classic Mac sound

# Timer hook for Zsh
preexec() {
  # Record start time
  _cmd_start_time=$SECONDS
}

precmd() {
  # If start time is set
  if [ -n "$_cmd_start_time" ]; then
    local now=$SECONDS
    local elapsed=$(($now - $_cmd_start_time))
    
    # If command took longer than threshold
    if [ $elapsed -ge $NOTIFY_THRESHOLD ]; then
      # Check if window is focused (optional, requires tmux or proprietary escapes)
      # For now, just play the sound:
      
      # 1. Play sound (asynchronous, don't block terminal)
      if command -v afplay >/dev/null; then
        afplay "$NOTIFY_SOUND" -v 0.5 &!
      else
        # Fallback for non-macOS or missing afplay
        tput bel
      fi
      
      # Optional: Visual notification if you don't have one yet
      # osascript -e 'display notification "Command completed" with title "Terminal"'
    fi
    
    # Reset timer
    unset _cmd_start_time
  fi
}

echo "🔊 Sound notifications enabled for commands longer than ${NOTIFY_THRESHOLD}s"

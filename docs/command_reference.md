# Slash Command Reference

| Command | Description | Source |
| --- | --- | --- |
| `/botinfo` | Comprehensive information about the running bot. | `src/commands/info_commands.py::InfoCommands.botinfo` |
| `/chaos run` | Trigger a chaos scenario immediately. | `src/commands/chaos_commands.py::ChaosCommands.run` |
| `/chaos status` | Show recent chaos drills and schedule info. | `src/commands/chaos_commands.py::ChaosCommands.status` |
| `/clear` | Clear the queue. | `src/commands/queue_commands.py::QueueCommands.clear` |
| `/connect` | Connect VectoBeat to your current voice channel. | `src/commands/connection_commands.py::ConnectionCommands.connect` |
| `/disconnect` | Disconnect VectoBeat from the voice channel. | `src/commands/connection_commands.py::ConnectionCommands.disconnect` |
| `/dj add-role` | Grant DJ permissions to a role. | `src/commands/dj_commands.py::DJCommands.add_role` |
| `/dj clear` | Allow anyone to control the queue by clearing DJ roles. | `src/commands/dj_commands.py::DJCommands.clear` |
| `/dj remove-role` | Revoke DJ permissions from a role. | `src/commands/dj_commands.py::DJCommands.remove_role` |
| `/dj show` | Display configured DJ roles and recent actions. | `src/commands/dj_commands.py::DJCommands.show` |
| `/guildinfo` | Detailed information about this guild. | `src/commands/info_commands.py::InfoCommands.guildinfo` |
| `/lavalink` | Inspect Lavalink node performance. | `src/commands/info_commands.py::InfoCommands.lavalink` |
| `/loop` | Set loop mode for playback. | `src/commands/music_controls.py::MusicControls.loop` |
| `/move` | Move a track within the queue. | `src/commands/queue_commands.py::QueueCommands.move` |
| `/nowplaying` | Show the currently playing track with live updates. | `src/commands/music_controls.py::MusicControls.nowplaying` |
| `/pause` | Pause playback. | `src/commands/music_controls.py::MusicControls.pause` |
| `/permissions` | Show the bot's permissions in this channel. | `src/commands/info_commands.py::InfoCommands.permissions` |
| `/ping` | Quick latency & uptime snapshot for VectoBeat. | `src/commands/info_commands.py::InfoCommands.ping` |
| `/play` | Play a song or playlist by search or URL. | `src/commands/music_controls.py::MusicControls.play` |
| `/playlist delete` | Remove a saved playlist. | `src/commands/queue_commands.py::QueueCommands.playlist_delete` |
| `/playlist list` | List all saved playlists for this guild. | `src/commands/queue_commands.py::QueueCommands.playlist_list` |
| `/playlist load` | Load a saved playlist into the current queue. | `src/commands/queue_commands.py::QueueCommands.playlist_load` |
| `/playlist save` | Persist the current queue as a named playlist. | `src/commands/queue_commands.py::QueueCommands.playlist_save` |
| `/profile set-announcement` | Choose how now-playing messages are displayed. | `src/commands/profile_commands.py::ProfileCommands.set_announcement` |
| `/profile set-autoplay` | Enable or disable autoplay when the queue finishes. | `src/commands/profile_commands.py::ProfileCommands.set_autoplay` |
| `/profile set-volume` | Set the default playback volume for this guild. | `src/commands/profile_commands.py::ProfileCommands.set_volume` |
| `/profile show` | Display the current playback profile for this guild. | `src/commands/profile_commands.py::ProfileCommands.show` |
| `/queue` | Show the current queue with details. | `src/commands/queue_commands.py::QueueCommands.queue` |
| `/queueinfo` | Detailed view of the queue with statistics. | `src/commands/queue_commands.py::QueueCommands.queueinfo` |
| `/remove` | Remove a track by its 1-based position. | `src/commands/queue_commands.py::QueueCommands.remove` |
| `/replay` | Restart the current track from the beginning. | `src/commands/music_controls.py::MusicControls.replay` |
| `/resume` | Resume playback. | `src/commands/music_controls.py::MusicControls.resume` |
| `/scaling evaluate` | Force an immediate scaling evaluation. | `src/commands/scaling_commands.py::ScalingCommands.evaluate` |
| `/scaling status` | Show current scaling metrics and last signal. | `src/commands/scaling_commands.py::ScalingCommands.status` |
| `/seek` | Seek within the current track (mm:ss). | `src/commands/music_controls.py::MusicControls.seek` |
| `/shuffle` | Shuffle the queue. | `src/commands/queue_commands.py::QueueCommands.shuffle` |
| `/skip` | Skip the current track. | `src/commands/music_controls.py::MusicControls.skip` |
| `/status` | Show detailed diagnostics for VectoBeat. | `src/commands/info_commands.py::InfoCommands.status` |
| `/stop` | Stop playback and clear the queue. | `src/commands/music_controls.py::MusicControls.stop` |
| `/uptime` | Show bot uptime with start timestamp. | `src/commands/info_commands.py::InfoCommands.uptime` |
| `/voiceinfo` | Show VectoBeat's current voice connection status. | `src/commands/connection_commands.py::ConnectionCommands.voiceinfo` |
| `/volume` | Set playback volume (0-200%). | `src/commands/music_controls.py::MusicControls.volume` |

# Slash Command Reference

| Command | Description | Source |
| --- | --- | --- |
| `/botinfo` | Comprehensive information about the running bot. | `bot/src/commands/info_commands.py::InfoCommands.botinfo` |
| `/chaos run` | Trigger a chaos scenario immediately. | `bot/src/commands/chaos_commands.py::ChaosCommands.run` |
| `/chaos status` | Show recent chaos drills and schedule info. | `bot/src/commands/chaos_commands.py::ChaosCommands.status` |
| `/clear` | Clear the queue. | `bot/src/commands/queue_commands.py::QueueCommands.clear` |
| `/compliance export` | Generate a compliance-ready JSONL export. | `bot/src/commands/compliance_commands.py::ComplianceCommands.export` |
| `/concierge request` | Request concierge assistance for migrations or incidents. | `bot/src/commands/concierge_commands.py::ConciergeCommands.request` |
| `/concierge resolve` | (Staff) mark a concierge request as fulfilled. | `bot/src/commands/concierge_commands.py::ConciergeCommands.resolve` |
| `/concierge usage` | Show remaining concierge hours this cycle. | `bot/src/commands/concierge_commands.py::ConciergeCommands.usage` |
| `/connect` | Connect VectoBeat to your current voice channel. | `bot/src/commands/connection_commands.py::ConnectionCommands.connect` |
| `/disconnect` | Disconnect VectoBeat from the voice channel. | `bot/src/commands/connection_commands.py::ConnectionCommands.disconnect` |
| `/dj add-role` | Grant DJ permissions to a role. | `bot/src/commands/dj_commands.py::DJCommands.add_role` |
| `/dj clear` | Allow anyone to control the queue by clearing DJ roles. | `bot/src/commands/dj_commands.py::DJCommands.clear` |
| `/dj remove-role` | Revoke DJ permissions from a role. | `bot/src/commands/dj_commands.py::DJCommands.remove_role` |
| `/dj show` | Display configured DJ roles and recent actions. | `bot/src/commands/dj_commands.py::DJCommands.show` |
| `/guildinfo` | Detailed information about this guild. | `bot/src/commands/info_commands.py::InfoCommands.guildinfo` |
| `/help` | Show available commands grouped by category. | `bot/src/commands/help_commands.py::HelpCommands.help` |
| `/lavalink` | Inspect Lavalink node performance. | `bot/src/commands/info_commands.py::InfoCommands.lavalink` |
| `/loop` | Set loop mode for playback. | `bot/src/commands/music_controls.py::MusicControls.loop` |
| `/move` | Move a track within the queue. | `bot/src/commands/queue_commands.py::QueueCommands.move` |
| `/nowplaying` | Show the currently playing track with live updates. | `bot/src/commands/music_controls.py::MusicControls.nowplaying` |
| `/pause` | Pause playback. | `bot/src/commands/music_controls.py::MusicControls.pause` |
| `/permissions` | Show the bot's permissions in this channel. | `bot/src/commands/info_commands.py::InfoCommands.permissions` |
| `/ping` | Quick latency & uptime snapshot for VectoBeat. | `bot/src/commands/info_commands.py::InfoCommands.ping` |
| `/play` | Play a song or playlist by search or URL. | `bot/src/commands/music_controls.py::MusicControls.play` |
| `/playlist delete` | Remove a saved playlist. | `bot/src/commands/queue_commands.py::QueueCommands.playlist_delete` |
| `/playlist list` | List all saved playlists for this guild. | `bot/src/commands/queue_commands.py::QueueCommands.playlist_list` |
| `/playlist load` | Load a saved playlist into the current queue. | `bot/src/commands/queue_commands.py::QueueCommands.playlist_load` |
| `/playlist save` | Persist the current queue as a named playlist. | `bot/src/commands/queue_commands.py::QueueCommands.playlist_save` |
| `/playlist sync` | Link a saved playlist to an external URL. | `bot/src/commands/queue_commands.py::QueueCommands.playlist_sync` |
| `/profile set-announcement` | Choose how now-playing messages are displayed. | `bot/src/commands/profile_commands.py::ProfileCommands.set_announcement` |
| `/profile set-autoplay` | Enable or disable autoplay when the queue finishes. | `bot/src/commands/profile_commands.py::ProfileCommands.set_autoplay` |
| `/profile set-volume` | Set the default playback volume for this guild. | `bot/src/commands/profile_commands.py::ProfileCommands.set_volume` |
| `/profile show` | Display the current playback profile for this guild. | `bot/src/commands/profile_commands.py::ProfileCommands.show` |
| `/queue` | Show the current queue with details. | `bot/src/commands/queue_commands.py::QueueCommands.queue` |
| `/queueinfo` | Detailed view of the queue with statistics. | `bot/src/commands/queue_commands.py::QueueCommands.queueinfo` |
| `/remove` | Remove a track by its 1-based position. | `bot/src/commands/queue_commands.py::QueueCommands.remove` |
| `/replay` | Restart the current track from the beginning. | `bot/src/commands/music_controls.py::MusicControls.replay` |
| `/resume` | Resume playback. | `bot/src/commands/music_controls.py::MusicControls.resume` |
| `/scaling evaluate` | Force an immediate scaling evaluation. | `bot/src/commands/scaling_commands.py::ScalingCommands.evaluate` |
| `/scaling status` | Show current scaling metrics and last signal. | `bot/src/commands/scaling_commands.py::ScalingCommands.status` |
| `/timeshift` | Move to a timestamp within the current track (mm:ss). | `bot/src/commands/music_controls.py::MusicControls.timeshift` |
| `/settings collaborative` | Enable or disable collaborative queueing. | `bot/src/commands/settings_commands.py::SettingsCommands.collaborative` |
| `/settings queue-limit` | Update the maximum queue size (respects plan limits). | `bot/src/commands/settings_commands.py::SettingsCommands.queue_limit` |
| `/shuffle` | Shuffle the queue. | `bot/src/commands/queue_commands.py::QueueCommands.shuffle` |
| `/skip` | Skip the current track. | `bot/src/commands/music_controls.py::MusicControls.skip` |
| `/status` | Show detailed diagnostics for VectoBeat. | `bot/src/commands/info_commands.py::InfoCommands.status` |
| `/stop` | Stop playback and clear the queue. | `bot/src/commands/music_controls.py::MusicControls.stop` |
| `/success acknowledge` | (Staff) acknowledge a success pod request. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.acknowledge` |
| `/success contact` | Show your account manager and escalation path. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.contact` |
| `/success request` | Submit a request to your success pod. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.request` |
| `/success resolve` | (Staff) resolve a success pod request. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.resolve` |
| `/success schedule` | (Staff) schedule a success pod session. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.schedule` |
| `/success set-contact` | (Staff) update the account manager contact info. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.set_contact` |
| `/success status` | Review recent success pod lifecycle updates. | `bot/src/commands/success_pod_commands.py::SuccessPodCommands.status` |
| `/uptime` | Show bot uptime with start timestamp. | `bot/src/commands/info_commands.py::InfoCommands.uptime` |
| `/voiceinfo` | Show VectoBeat's current voice connection status. | `bot/src/commands/connection_commands.py::ConnectionCommands.voiceinfo` |
| `/volume` | Set playback volume (0-200%). | `bot/src/commands/music_controls.py::MusicControls.volume` |
| `/volume-info` | Show the current and default volume settings. | `bot/src/commands/music_controls.py::MusicControls.volume_info` |

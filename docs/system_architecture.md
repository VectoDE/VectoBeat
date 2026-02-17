# VectoBeat System Architecture

## Overview
This document outlines the comprehensive system architecture of VectoBeat, detailing the interaction between the Discord platform, the control panel, the bot runtime, and various media sources.

## Architecture Diagram
The VectoBeat system is composed of several key subgraphs: the Discord Platform, the Control Panel, the Bot Runtime, and Media Sources.

- **Discord Platform**: This is where users interact with the bot via slash commands and voice. It includes the Discord API & Gateway.
- **Control Panel**: Built with Next.js, this is the web interface for managing the bot. It includes Next.js API Routes, a Dashboard UI, webhooks for bot status, a durable queue sync store (Redis/MySQL), a MySQL database with Prisma ORM, a mailer for notifications, and domain branding.
- **Bot Runtime**: This is the core of the bot, built with discord.py and a Lavalink client. It includes the AutoShardedBot Core, slash command suites, a queue sync worker, a concierge client for secure communication with the control panel, a status API, Prometheus metrics, configuration management, and an embed factory for branding.
- **Media Sources**: These are the external services from which the bot streams media, including YouTube, SoundCloud, Spotify (via plugins), and direct HTTP streams.

## Data and Communication Flows

### Discord Flows
- Users send slash commands and voice interactions to the Discord API & Gateway.
- The Discord Gateway sends events to the Bot Runtime.
- The Bot Runtime sends REST calls back to the Discord Gateway.

### Control Panel and Bot Runtime Bridge
- The Queue Sync Worker in the bot pushes queue snapshots to the Queue Sync Store in the control panel.
- The Next.js API Routes in the control panel read and write these snapshots.
- The bot pushes status updates to the Bot Status/Event Webhooks in the control panel.
- The Status API in the bot provides health and statistics to the Next.js API Routes.
- The Concierge Client in the bot makes secure calls to the Next.js API Routes for sensitive operations.

### Persistence and Notifications
- The Next.js API Routes use Prisma to read from and write to the MySQL database.
- The Dashboard UI makes REST calls to the Next.js API Routes.
- The Next.js API Routes send notifications via the Mailer.

### Lavalink Media Path
- The Bot Runtime communicates with the Lavalink Node via WebSocket and REST.
- The Lavalink Node streams voice PCM to the Discord Voice Gateway.
- The Lavalink Node fetches media from YouTube, SoundCloud, Spotify, and HTTP streams.

### Observability
- The Bot Runtime exposes Prometheus metrics.
- The Bot Runtime sends structured logs to a logging and APM service.
- The Embed Factory fetches branding information from the Next.js API Routes.
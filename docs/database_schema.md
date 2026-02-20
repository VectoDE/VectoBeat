# VectoBeat Database Schema

## Overview
This document outlines the database schema for the VectoBeat application, which is designed to store information about users, guilds, queues, and tracks.

## Entity-Relationship Diagram
The database schema consists of four main entities:

- **USERS**: Stores information about Discord users.
    - `id` (string): The user's Discord ID.
    - `username` (string): The user's Discord username.
    - `avatar` (string): The URL of the user's Discord avatar.
- **GUILDS**: Stores information about Discord guilds (servers).
    - `id` (string): The guild's Discord ID.
    - `name` (string): The name of the guild.
    - `owner_id` (string): The Discord ID of the guild's owner.
- **QUEUES**: Stores information about music queues for each guild.
    - `id` (string): A unique identifier for the queue.
    - `guild_id` (string): The ID of the guild this queue belongs to.
- **TRACKS**: Stores information about the tracks in each queue.
    - `id` (string): A unique identifier for the track.
    - `queue_id` (string): The ID of the queue this track belongs to.
    - `title` (string): The title of the track.
    - `artist` (string): The artist of the track.

## Relationships
- A **USER** can manage one or more **GUILDS**.
- A **GUILD** has one **QUEUE**.
- A **QUEUE** contains one or more **TRACKS**.
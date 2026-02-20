# VectoBeat Backend Architecture

## Overview
This document outlines the backend architecture of the VectoBeat application, which is designed as a microservices-based system.

## Architecture Diagram
The backend architecture consists of several services orchestrated by an API Gateway:

- **Client**: The client (e.g., the frontend application) sends requests to the API Gateway.
- **API Gateway**: This is the single entry point for all client requests. It routes requests to the appropriate downstream service.
- **Auth Service**: This service handles user authentication and authorization.
- **Bot Service**: This service contains the core logic for the Discord bot and interacts with the Discord API.
- **Queue Service**: This service manages the music queue for each guild, using Redis for storage.
- **Discord API**: The Bot Service communicates with the Discord API to interact with the Discord platform.
- **Redis**: The Queue Service uses Redis for fast, in-memory storage of queue data.
- **Database**: The Auth Service, Bot Service, and Queue Service all interact with a central database for persistent data storage.
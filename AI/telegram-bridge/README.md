# AI Agent Monitor for HestiaCP

An autonomous DevOps agent and monitoring system for HestiaCP servers, powered by LLMs (DeepSeek, GPT-4, Claude) via Dify.

## Features

*   **Interactive Agent:** Chat with your server via Telegram to diagnose issues, check logs, and fix problems.
*   **Real-time Streaming:** Experience a native "typewriter" effect in Telegram as the AI generates its thoughts and answers in real-time, just like the Dify web UI.
*   **Anti-Hang Protection:** Built-in 60-second idle timeout ensures the Telegram bridge cleanly disconnects and alerts you if the upstream AI provider or server hangs.
*   **Automated Monitor:** A cron-based agent that wakes up, checks system health (Hestia queues, backups, services), and alerts you only if necessary.
*   **Knowledge-Aware:** Uses a RAG knowledge base to understand HestiaCP specific paths and CLI commands.
*   **Safe Execution:** Implements strict safety protocols (read-only first, confirmation for risky commands).

## Documentation

We have consolidated the documentation into two main guides:

1.  [**01-installation-setup.md**](docs/01-installation-setup.md): Complete guide to setting up the Server, SSH Keys, Telegram Bot, and Dify.
2.  [**02-dify-workflow-architecture.md**](docs/02-dify-workflow-architecture.md): Advanced guide on how the Dify workflow works, including the "Master Prompt" architecture and Knowledge Base integration.

## Quick Start

1.  **Clone this repo.**
2.  **Follow Guide 01** to set up your environment.
3.  **Import the Chatflow** (`HestiaCP-DevOps-CHATFLOW.yml`) into Dify.
4.  **Connect** your Telegram Bot.

## Repository Structure

*   `prompts/`: The system prompts that drive the AI's behavior.
*   `knowledge/`: Markdown documentation for the AI to learn from.
*   `docs/`: Human-readable setup guides.
*   `scripts/`: Helper scripts for installation.

## License

MIT

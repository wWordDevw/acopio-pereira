# Acopio Pereira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA + API para inventariar insumos de ayuda en puntos de acopio de Pereira, desplegada en Dokploy.

**Architecture:** HTML nativo + Leaflet vendorizado; API Node `node:http` + better-sqlite3; stock derivado de movimientos.

**Tech Stack:** Node 22, better-sqlite3, Leaflet 1.9.4, Dokploy Static + Dockerfile.

## Global Constraints

- Sin cuentas. Sin estilos inline. Sin puertos Docker públicos.
- Caja geográfica Pereira/Dosquebradas. Voz por reglas, no LLM.
- Mismo origen `/api`. Health en `/api/salud` y `/api/health`.

---

Implemented in-repo: API + tests (19 green), PWA pages, Dokploy deploy.

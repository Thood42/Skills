<%*
const title = await tp.system.prompt("Source title");
const sourceType = await tp.system.suggester(
  ["book", "paper", "article", "primary-document", "interview", "lecture", "dataset", "web-page", "social-media-post", "analysis"],
  ["book", "paper", "article", "primary-document", "interview", "lecture", "dataset", "web-page", "social-media-post", "analysis"]
);
const tier = await tp.system.suggester(
  ["primary", "analyst", "journalism", "reference", "secondary"],
  ["primary", "analyst", "journalism", "reference", "secondary"]
);
const url = await tp.system.prompt("URL (leave blank if none)", "");
const year = await tp.system.prompt("Year (leave blank if unknown)", "");
-%>
---
note-type: source
handle: <% tp.file.title %>
source-type: <% sourceType %>
title: "<% title %>"
# NOTE: no "Source: <handle>" alias. It can never be reached — Obsidian rejects
# ':' in a link target before it consults aliases — and its only real effect is to
# make link checkers report green on citations that are actually dead.
aliases: ["<% title %>", "<% tp.file.title %>"]
tags: [source, source-<% tier %>]
tier: <% tier %>
<%* if (year) { -%>
year: <% year %>
<%* } -%>
<%* if (url) { -%>
url: "<% url %>"
<%* } -%>
created: <% tp.date.now("YYYY-MM-DD") %>
---

# <% title %>

**Link:** <<% url %>>


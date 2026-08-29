<%*
const etype = await tp.system.suggester(
  ["person", "organization", "place", "event", "work", "concept", "theory", "method", "field", "game", "software", "platform"],
  ["person", "organization", "place", "event", "work", "concept", "theory", "method", "field", "game", "software", "platform"]
);
-%>
---
note-type: entity
entity-type: <% etype %>
entity: <% tp.file.title %>
title: "<% tp.file.title %>"
aliases: ["<% tp.file.title %>"]
tags: [entity, <% etype %>]
created: <% tp.date.now("YYYY-MM-DD") %>
---

# <% tp.file.title %>

<!-- kg generate preserves entity-type/aliases above and any summary paragraph you write
     here, above the "## Relations" heading it adds on the next rebuild. -->


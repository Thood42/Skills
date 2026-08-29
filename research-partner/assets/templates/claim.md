<%*
const stance = await tp.system.suggester(
  ["supports", "refutes", "qualifies"],
  ["supports", "refutes", "qualifies"]
);
-%>
---
note-type: claim
stance: <% stance %>
title: "<% tp.file.title %>"
aliases: ["<% tp.file.title %>"]
status: seed
confidence: 0.5
tags: []
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
review-after: <% tp.date.now("YYYY-MM-DD", 90) %>

about: []
evidence: []
contradicts: []

asserted-by: user
extraction-run: manual
---

# <% tp.file.title %>



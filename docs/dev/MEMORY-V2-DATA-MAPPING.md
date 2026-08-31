# Ceo Knowledge Memory OS V2 - Data Mapping

## Shared envelope

The shared MemoryNodeEnvelope is a logical wrapper. It does not replace domain ownership.

| Envelope field | Local M1-M2 | Cloud now | M3 target |
| --- | --- | --- | --- |
| node_id | stable typed ID | not persisted as common key | additive stable replica key |
| node_type | SQLite + Markdown | inferred from domain table | explicit mapping |
| object_type/object_id | optional | existing domain/table UUID | mapping to existing row |
| reference_path | Markdown/SQLite | none common | additive metadata |
| project_id | indexed | existing where supported | retained |
| topic_ids | node_topics | topic/tags/knowledge links | normalized mapping |
| entity_ids | node_entities | people/domain refs vary | normalized mapping |
| source_ids | source_id | sources table | retained/provenance graph |
| revision | Local file/index revision | knowledge_revisions for knowledge | replica revision contract |
| content_hash | Local SHA-256 | source/chunk fingerprints vary | sync idempotency key |

## Local indexes

- nodes: primary catalog.
- memory_fts: keyword/FTS lookup.
- node_topics: Topic Index.
- node_entities: Entity Index.
- node_edges: Local Graph Index.
- node_embeddings: optional local vectors.

## Cloud tables retained

No M1-M2 migration is required. Existing ceo_knowledge tables remain authoritative for cloud/mobile until M3 replica mapping is designed and verified.

## Conversation mapping

knowledge.conversation_summary continues writing the existing cloud conversation_summaries object when cloud is available. M2 additionally creates a local conversation node containing summary, decisions, open loops and facts; a raw transcript is not required.

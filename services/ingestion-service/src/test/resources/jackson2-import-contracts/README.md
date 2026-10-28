# Pre-upgrade import JSON contracts

These fixtures were generated from the actual DTO sources at commit
`61ef2f2bb4af92da94c7d3b44f66856f382fbf62` with Kotlin compiler 1.9.24,
Kotlin runtime 1.9.25, Spring Boot 3.5.16 `JacksonAutoConfiguration`,
Spring Framework 6.2.19, and its BOM-managed Jackson 2.21.4 on Java 21.
They were captured before enabling Jackson 3 compatibility defaults on 2026-10-26.

Each `*-input.json` was read as `ImportRequest` and written using that Boot mapper.
The corresponding `*-jackson2.json` is the exact UTF-8 output without a trailing
newline. Do not regenerate expected outputs with Jackson 3: the test protects
previously persisted request hashes across the upgrade.

| Fixture | Bytes | SHA-256 |
| --- | ---: | --- |
| legacy-jackson2.json | 1466 | fa390a8e25f94c57d363e5757d407c34c1c143f2c3444f1cce35fb43ba41928e |
| ordered-jackson2.json | 1159 | d615418c8aeaed9b6302b2662756b9c62f28bad087672961314c79036000437d |

Coverage includes article and ordered-root structures, source evidence, UUIDs,
dates, Unicode, nullable fields, Kotlin defaults, and map insertion order.

# S3 — LAN first-frame latency

**Question.** Does the same fMP4 stream start quickly enough over the LAN to keep preview
enabled in LAN mode?

**Pass criterion.** First frame ≤ 3 s over 1 GbE, ≤ 5 s over 802.11ac.

## Method

The S2 server binds `0.0.0.0`; the S2 probe ran ten cold loads against
`http://127.0.0.1:1441/` and ten against the machine's LAN address,
`http://192.168.1.161:1441/`. Each sample creates a fresh `<video>`, requests the file with
a cache-busting query, and records `loadeddata`/`canplay`/`playing` from the moment `load()`
is called. The active interface is Wi-Fi; Ethernet is disconnected.

## Results

| Origin | First `playing` median | Range | Seek to 5 s |
| --- | --- | --- | --- |
| loopback `127.0.0.1` | 23.5 ms | 21–68 ms | 13 ms |
| LAN address `192.168.1.161` | 16.5 ms | 16–30 ms | 9 ms |

Both are two orders of magnitude inside the 3 s wired and 5 s wireless budgets.

## Verdict

**Pass with a noted limitation.** The stream starts over the LAN interface in tens of
milliseconds. The limitation is the topology: client and server are the same machine, so
Windows can shortcut the path and no second device exercised the 802.11ac air link. The
measured budget is so far below the threshold that a real client cannot plausibly reach it
with a 2 MB fragment at 2 Mbps, but this is a same-host measurement, not a phone/laptop
pass.

**Design consequence.** Preview stays enabled in LAN mode with no reduced resolution or
prepared-range cut. A second-device check belongs to the Phase 5 release checklist; it does
not gate increment 3.

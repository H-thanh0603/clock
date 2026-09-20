# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test ``LockedJsonFileMemoryStore``: đúng protocol MemoryStore + chống mất
fact khi nhiều process cùng ghi (multi-worker uvicorn)."""

from __future__ import annotations

import asyncio
import json
import multiprocessing as mp
from datetime import UTC, datetime

import pytest

from aurel_agents.memory_store import LockedJsonFileMemoryStore


def _fact(key: str, value: str = "v"):
    from commerce_common.types import MemoryFact

    return MemoryFact(key=key, value=value, updated_at=datetime.now(UTC))


@pytest.mark.asyncio
async def test_implements_memory_store_contract(tmp_path):
    from commerce_common.memory import check_memory_store

    check_memory_store(LockedJsonFileMemoryStore(tmp_path / "m.json"))


@pytest.mark.asyncio
async def test_roundtrip_upsert_get_delete(tmp_path):
    store = LockedJsonFileMemoryStore(tmp_path / "m.json")
    await store.upsert_facts("u1", [_fact("style", "gợ")])
    assert [f.key for f in await store.get_facts("u1")] == ["style"]
    assert await store.search_facts("u1", "gợ") != []
    assert await store.delete_fact("u1", "style") is True
    assert await store.delete_fact("u1", "style") is False
    assert await store.get_facts("u1") == []


@pytest.mark.asyncio
async def test_purge_generation_and_clear(tmp_path):
    store = LockedJsonFileMemoryStore(tmp_path / "m.json")
    await store.upsert_facts("u1", [_fact("a")])
    assert await store.purge_generation("u1") == 0
    await store.clear("u1")
    assert await store.purge_generation("u1") == 1
    assert await store.get_facts("u1") == []


@pytest.mark.asyncio
async def test_file_is_owner_only(tmp_path):
    store = LockedJsonFileMemoryStore(tmp_path / "m.json")
    await store.upsert_facts("u1", [_fact("a")])
    assert (tmp_path / "m.json").stat().st_mode & 0o077 == 0


@pytest.mark.asyncio
async def test_corrupt_file_does_not_crash_turn(tmp_path):
    path = tmp_path / "m.json"
    path.write_text("{ cụt", encoding="utf-8")
    store = LockedJsonFileMemoryStore(path)
    assert await store.get_facts("u1") == []
    assert await store.purge_generation("u1") == 0


@pytest.mark.asyncio
async def test_atomic_write_leaves_no_tmp(tmp_path):
    store = LockedJsonFileMemoryStore(tmp_path / "m.json")
    await store.upsert_facts("u1", [_fact("a")])
    leftovers = [p.name for p in tmp_path.iterdir() if p.name.endswith(".tmp")]
    assert leftovers == []
    assert json.loads((tmp_path / "m.json").read_text())["facts"]["u1"].keys() == {"a"}


def _writer(path: str, worker: int, count: int, barrier) -> None:
    """Process con: mỗi process ghi `count` fact riêng; barrier ép chạy song song."""
    from aurel_agents.memory_store import LockedJsonFileMemoryStore as S

    async def run() -> None:
        store = S(path)
        barrier.wait()
        for i in range(count):
            await store.upsert_facts("shared", [_fact(f"w{worker}-f{i}")])
        await store.upsert_facts("shared", [_fact(f"w{worker}-end")])

    asyncio.run(run())


def test_no_lost_update_across_processes(tmp_path):
    """3 process cùng read-modify-write → KHÔNG mất fact nào (lock + atomic)."""
    path = str(tmp_path / "m.json")
    workers, count = 3, 40
    barrier = mp.Barrier(workers)
    procs = [
        mp.Process(target=_writer, args=(path, w, count, barrier)) for w in range(workers)
    ]
    for p in procs:
        p.start()
    for p in procs:
        p.join(60)
        assert p.exitcode == 0

    data = json.loads((tmp_path / "m.json").read_text())["facts"]["shared"]
    expected = {f"w{w}-f{i}" for w in range(workers) for i in range(count)}
    expected |= {f"w{w}-end" for w in range(workers)}
    assert set(data.keys()) == expected

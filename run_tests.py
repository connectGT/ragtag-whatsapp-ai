"""
run_tests.py — Unified Automated Test Runner for Team RAGTAG (Tiers 1–4)
========================================================================
Runs tests across all 4 tiers and reports structured summaries.

Usage:
    python run_tests.py                 # Run all tiers (1-4)
    python run_tests.py --tier 1        # Run Tier 1 only
    python run_tests.py --tier 2        # Run Tier 2 only
    python run_tests.py --tier 3        # Run Tier 3 only
    python run_tests.py --tier 4        # Run Tier 4 only
    python run_tests.py -v              # Run all tiers with verbose logs
"""

import argparse
import os
import sys
import time
import unittest
from pathlib import Path

# Add project root and backend to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
TESTS_DIR = PROJECT_ROOT / "tests"

for path in [str(PROJECT_ROOT), str(BACKEND_DIR), str(TESTS_DIR)]:
    if path not in sys.path:
        sys.path.insert(0, path)

TIERS = {
    1: {
        "name": "Tier 1: Unit & Schema Integrity",
        "module": "tests.test_unit_schema",
        "description": "SQLite ORM models, mandatory foreign key pragma, regex triggers, flexible date parser",
    },
    2: {
        "name": "Tier 2: Extractor & Ingestion Integration",
        "module": "tests.test_integration_extractor",
        "description": "Dual-mode task extraction, 1.0s timeout fallback, task upgrade preservation, chat export ingest",
    },
    3: {
        "name": "Tier 3: Flask API Contracts",
        "module": "tests.test_api_contracts",
        "description": "Flask REST endpoints (/api/status, /api/tasks, /api/chats, /api/catchup, /api/summary, /api/settings)",
    },
    4: {
        "name": "Tier 4: End-to-End Simulation & Air-Gap",
        "module": "tests.test_e2e_simulation",
        "description": "Complete faculty evaluation workflow, FK traceability, ICS export, zero external network leakage",
    },
}


def run_tier(tier_num: int, verbose: bool = False) -> tuple[int, int, int, int, float]:
    """Runs a single test tier and returns (tests_run, failures, errors, skipped, elapsed)."""
    tier_info = TIERS[tier_num]
    print(f"\n=======================================================")
    print(f">>> {tier_info['name']}")
    print(f"    Description: {tier_info['description']}")
    print(f"=======================================================")

    loader = unittest.TestLoader()
    try:
        suite = loader.loadTestsFromName(tier_info["module"])
    except Exception as e:
        print(f"[!] Error loading {tier_info['module']}: {e}")
        return 0, 0, 1, 0, 0.0

    verbosity = 2 if verbose else 1
    runner = unittest.TextTestRunner(verbosity=verbosity)
    start_time = time.time()
    result = runner.run(suite)
    elapsed = time.time() - start_time

    tests_run = result.testsRun
    failures = len(result.failures)
    errors = len(result.errors)
    skipped = len(result.skipped)

    return tests_run, failures, errors, skipped, elapsed


def main():
    parser = argparse.ArgumentParser(description="Team RAGTAG Automated Test Suite Runner")
    parser.add_argument("--tier", type=int, choices=[1, 2, 3, 4], help="Run a specific test tier (1-4)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose test output")
    args = parser.parse_args()

    selected_tiers = [args.tier] if args.tier else [1, 2, 3, 4]

    print("\n=================================================================")
    print("[RAGTAG] AUTOMATED TEST SUITE RUNNER (TIERS 1-4)")
    print(f"         Python Interpreter: {sys.executable}")
    print(f"         Project Root: {PROJECT_ROOT}")
    print("=================================================================")

    tier_results = {}
    total_start = time.time()

    for t in selected_tiers:
        tests_run, failures, errors, skipped, elapsed = run_tier(t, verbose=args.verbose)
        tier_results[t] = {
            "name": TIERS[t]["name"],
            "run": tests_run,
            "passed": tests_run - failures - errors - skipped,
            "failed": failures,
            "errors": errors,
            "skipped": skipped,
            "elapsed": elapsed,
        }

    total_elapsed = time.time() - total_start

    # Print Executive Summary Table
    print("\n" + "=" * 70)
    print("TEST SUITE EXECUTIVE SUMMARY")
    print("=" * 70)
    print(f"{'Tier':<35} | {'Run':<5} | {'Pass':<5} | {'Skip':<5} | {'Fail':<5} | {'Time':<6}")
    print("-" * 70)

    total_run = 0
    total_pass = 0
    total_skip = 0
    total_fail = 0

    for t, res in tier_results.items():
        total_run += res["run"]
        total_pass += res["passed"]
        total_skip += res["skipped"]
        total_fail += res["failed"] + res["errors"]
        time_str = f"{res['elapsed']:.2f}s"
        print(f"{res['name']:<35} | {res['run']:<5} | {res['passed']:<5} | {res['skipped']:<5} | {res['failed'] + res['errors']:<5} | {time_str:<6}")

    print("-" * 70)
    print(f"{'TOTAL':<35} | {total_run:<5} | {total_pass:<5} | {total_skip:<5} | {total_fail:<5} | {total_elapsed:.2f}s")
    print("=" * 70)

    if total_fail == 0:
        print("\n[OK] ALL EXECUTED TESTS PASSED CLEANLY!")
        if total_skip > 0:
            print(f"[INFO] {total_skip} progressive testability contract tests were safely skipped pending Milestone M1/M2 code generation.")
        sys.exit(0)
    else:
        print(f"\n[FAIL] TEST SUITE FAILED with {total_fail} failure(s)/error(s).")
        sys.exit(1)


if __name__ == "__main__":
    main()

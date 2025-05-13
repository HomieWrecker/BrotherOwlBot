"""
Test script for stats estimation functionality
This tests the ability to estimate player stats
"""

import os
import json
from utils.stats_estimator import (
    add_spy_data, get_spy_data, 
    estimate_primary_stat, estimate_total_stats,
    get_stat_confidence, format_stats_for_display,
    get_recommendation
)

# Test data
TEST_PLAYER_ID = "12345"
TEST_PLAYER_NAME = "TestPlayer"
TEST_PLAYER_STATS = {
    "str": 1000000,
    "spd": 800000,
    "dex": 700000,
    "def": 500000
}
TEST_DAMAGE = 10000
TEST_TURNS = 5
TEST_MY_PRIMARY = 1000000

def test_add_and_get_spy_data():
    """Test adding and retrieving spy data"""
    print("\nTesting spy data storage and retrieval...")
    
    # Add spy data
    result = add_spy_data(
        TEST_PLAYER_ID, 
        TEST_PLAYER_STATS["str"],
        TEST_PLAYER_STATS["spd"],
        TEST_PLAYER_STATS["dex"],
        TEST_PLAYER_STATS["def"]
    )
    
    # Verify it was added correctly
    total = sum(TEST_PLAYER_STATS.values())
    assert result["str"] == TEST_PLAYER_STATS["str"], "Strength doesn't match"
    assert result["spd"] == TEST_PLAYER_STATS["spd"], "Speed doesn't match"
    assert result["dex"] == TEST_PLAYER_STATS["dex"], "Dexterity doesn't match"
    assert result["def"] == TEST_PLAYER_STATS["def"], "Defense doesn't match"
    assert result["total"] == total, "Total doesn't match"
    assert "timestamp" in result, "Timestamp missing"
    
    # Retrieve the data
    retrieved = get_spy_data(TEST_PLAYER_ID)
    assert retrieved is not None, "Failed to retrieve spy data"
    assert retrieved["str"] == TEST_PLAYER_STATS["str"], "Retrieved strength doesn't match"
    
    print("✓ Spy data storage and retrieval working correctly")
    return retrieved

def test_stat_estimation():
    """Test the stat estimation functionality"""
    print("\nTesting stat estimation...")
    
    # Test primary stat estimation
    primary_est = estimate_primary_stat(TEST_DAMAGE, TEST_TURNS, TEST_MY_PRIMARY)
    print(f"Estimated primary stat: {primary_est:,}")
    assert primary_est is not None, "Primary stat estimation failed"
    
    # Test total stat estimation
    total_est = estimate_total_stats(primary_est)
    print(f"Estimated total stats: {total_est:,}")
    assert total_est is not None, "Total stat estimation failed"
    assert total_est > primary_est, "Total stats should be greater than primary"
    
    print("✓ Stat estimation working correctly")
    return {"primary": primary_est, "total": total_est}

def test_confidence_and_formatting():
    """Test confidence calculation and formatting"""
    print("\nTesting confidence levels and formatting...")
    
    # Get spy data
    spy_data = get_spy_data(TEST_PLAYER_ID)
    assert spy_data is not None, "No spy data available for testing"
    
    # Test confidence level
    confidence = get_stat_confidence(spy_data)
    print(f"Confidence level for spy data: {confidence}")
    
    # Format spy data
    spy_formatted = format_stats_for_display(TEST_PLAYER_ID, spy_data, confidence)
    print("\nFormatted spy data:")
    print(spy_formatted)
    
    # Format estimated data
    est_data = test_stat_estimation()
    est_formatted = format_stats_for_display(TEST_PLAYER_ID, est_data, "low")
    print("\nFormatted estimated data:")
    print(est_formatted)
    
    print("✓ Confidence and formatting working correctly")

def test_battle_recommendation():
    """Test battle recommendation logic"""
    print("\nTesting battle recommendations...")
    
    # Test recommendations for different stat ratios
    test_cases = [
        {"my_stats": 3000000, "enemy_stats": 1000000, "expected": "safe"},
        {"my_stats": 1000000, "enemy_stats": 1000000, "expected": "caution"},
        {"my_stats": 500000, "enemy_stats": 1000000, "expected": "avoid"}
    ]
    
    for i, case in enumerate(test_cases):
        rec = get_recommendation(case["my_stats"], case["enemy_stats"])
        print(f"Case {i+1}: My stats {case['my_stats']:,} vs Enemy {case['enemy_stats']:,} → {rec.upper()}")
        assert rec == case["expected"], f"Recommendation doesn't match expected: got {rec}, expected {case['expected']}"
    
    print("✓ Battle recommendations working correctly")

def run_tests():
    """Run all tests"""
    print("Starting stats estimator tests...\n")
    
    try:
        # Run all tests
        test_add_and_get_spy_data()
        test_stat_estimation()
        test_confidence_and_formatting()
        test_battle_recommendation()
        
        print("\n✓ All tests completed successfully!")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")

if __name__ == "__main__":
    run_tests()
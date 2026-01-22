#!/bin/bash

echo "Monitoring template fetch progress..."
echo "=================================="

while true; do
    # Check if process is still running
    if ! pgrep -f "fetch-templates" > /dev/null; then
        echo "Fetch process completed!"
        break
    fi
    
    # Get database size
    DB_SIZE=$(ls -lh data/nodes.db 2>/dev/null | awk '{print $5}')
    
    # Get template count
    TEMPLATE_COUNT=$(sqlite3 data/nodes.db "SELECT COUNT(*) FROM templates" 2>/dev/null || echo "0")
    
    # Get last log entry
    LAST_LOG=$(tail -n 1 fetch_log.txt 2>/dev/null | grep "Fetching template details" | tail -1)
    
    # Display status
    echo -ne "\rDB Size: $DB_SIZE | Templates: $TEMPLATE_COUNT | $LAST_LOG"
    
    sleep 5
done

echo ""
echo "Final statistics:"
echo "-----------------"
ls -lh data/nodes.db
sqlite3 data/nodes.db "SELECT COUNT(*) as count, printf('%.1f MB', SUM(LENGTH(workflow_json_compressed))/1024.0/1024.0) as compressed_size FROM templates"
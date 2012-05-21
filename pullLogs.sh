#!/bin/bash
cd /home/po/pokemon-online/bin/logs/battles
mkdir "/var/www/Admin/battleLogs/$1"
for (( n=0; n<=$2; n++ ))
do
	x=$(date -d "$n days ago" +%Y-%m-%d)
	for i in $(grep -lir "$1's team" $x)
	do
		cp $i "/var/www/Admin/battleLogs/$1/".
	done
done

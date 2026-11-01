#!/usr/bin/env bash
# Runs real purses on Arc mainnet through every exit path. Appends each transaction to ops/txs.tsv.
set -u
cd "$(dirname "$0")/.."
set -a; . "/Users/kinnu/arc mircogrants/contracts/.env"; . ./.env.demo; set +a
case "$PRIVATE_KEY" in 0x*) ;; *) PRIVATE_KEY="0x$PRIVATE_KEY";; esac
P=0xc81332357d6832d5fddd8ecdc884ef4e461c422b
U=0x3600000000000000000000000000000000000000
R=https://rpc.mainnet.arc.io
ME=0xC112DCb724a80E00Af0980e3a4023c4833B4F04e
tx() { # label key target sig args...
  local label=$1 key=$2 to=$3; shift 3
  local h
  for i in 1 2 3 4; do
    h=$(arc-cast send "$to" "$@" --rpc-url $R --private-key "$key" --gas-price 30gwei --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['transactionHash'] if d['status']=='0x1' else '')" 2>/dev/null)
    [ -n "$h" ] && break; sleep 6
  done
  printf '%s\t%s\n' "$label" "${h:-FAILED}" | tee -a ops/txs.tsv
}
count() { arc-cast call $P 'purseCount()(uint256)' --rpc-url $R | awk '{print $1}'; }
now() { date +%s; }

tx "approve (organiser wallet)" "$PRIVATE_KEY" $U 'approve(address,uint256)' $P 3000000
tx "approve (second funder)" "$DEMO_PRIVATE_KEY" $U 'approve(address,uint256)' $P 100000

# Launch prize: stays open until the organiser names winners.
ID=$(count)
NAMEBY=$(date -j -f '%Y-%m-%d %H:%M' '2026-11-02 08:30' +%s)
tx "launch prize $ID: create, 1 USDC" "$PRIVATE_KEY" $P 'create(string,uint256,uint64,uint64)' 'Purse launch prize: best bug or idea' 1000000 "$NAMEBY" 604800

# Refund path: two funders, no winners named in time, each gets their own money back.
ID=$(count)
tx "refund path $ID: create, 0.10" "$PRIVATE_KEY" $P 'create(string,uint256,uint64,uint64)' 'Test: nobody named in time' 100000 $(( $(now) + 45 )) 60
tx "refund path $ID: second funder adds 0.05" "$DEMO_PRIVATE_KEY" $P 'add(uint256,uint256)' "$ID" 50000
sleep 50
tx "refund path $ID: refund organiser" "$DEMO_PRIVATE_KEY" $P 'refund(uint256,address)' "$ID" $ME
tx "refund path $ID: refund second funder" "$PRIVATE_KEY" $P 'refund(uint256,address)' "$ID" $DEMO_ADDRESS

# Sweep path: winner named, not delivered in the window, money returns to organiser.
ID=$(count)
tx "sweep path $ID: create, 0.10" "$PRIVATE_KEY" $P 'create(string,uint256,uint64,uint64)' 'Test: prize left unclaimed' 100000 $(( $(now) + 600 )) 60
tx "sweep path $ID: lock" "$PRIVATE_KEY" $P 'lock(uint256)' "$ID"
tx "sweep path $ID: name own second wallet" "$PRIVATE_KEY" $P 'name(uint256,address[],uint256[])' "$ID" "[$DEMO_ADDRESS]" "[100000]"
sleep 65
tx "sweep path $ID: sweep back" "$DEMO_PRIVATE_KEY" $P 'sweep(uint256)' "$ID"

# Many winners in one purse, own test wallets, each delivered by someone other than the winner.
ID=$(count)
WS=""; AS=""; : > .env.testwallets; chmod 600 .env.testwallets
for n in 1 2 3 4 5 6 7 8 9 10; do
  J=$(arc-cast wallet new --json 2>/dev/null); A=$(echo "$J" | python3 -c "import json,sys;d=json.load(sys.stdin)[0];print(d['address'])")
  echo "$J" >> .env.testwallets
  WS="$WS,$A"; AS="$AS,10000"
done
WS=${WS#,}; AS=${AS#,}
tx "ten winners $ID: create, 0.10" "$PRIVATE_KEY" $P 'create(string,uint256,uint64,uint64)' 'Test: ten winners, one pool' 100000 $(( $(now) + 600 )) 86400
tx "ten winners $ID: lock" "$PRIVATE_KEY" $P 'lock(uint256)' "$ID"
tx "ten winners $ID: name" "$PRIVATE_KEY" $P 'name(uint256,address[],uint256[])' "$ID" "[$WS]" "[$AS]"
for A in ${WS//,/ }; do tx "ten winners $ID: deliver" "$DEMO_PRIVATE_KEY" $P 'deliver(uint256,address)' "$ID" "$A"; sleep 1; done
echo finished

-include .env

.PHONY: all test clean deploy fund help install snapshot format anvil 

DEFAULT_ANVIL_KEY := 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

help:
	@echo "Usage:"
	@echo "  make deploy [ARGS=...]\n    example: make deploy ARGS=\"--network sepolia\""
	@echo ""
	@echo "  make fund [ARGS=...]\n    example: make deploy ARGS=\"--network sepolia\""

all: clean remove install update build

# Clean the repo
clean  :; forge clean

# Remove modules
remove :; rm -rf .gitmodules && rm -rf .git/modules/* && rm -rf lib && touch .gitmodules && git add . && git commit -m "modules"

install :; forge install cyfrin/foundry-devops@0.1.0 --no-commit && forge install smartcontractkit/chainlink-brownie-contracts@0.6.1 --no-commit && forge install foundry-rs/forge-std@v1.5.3 --no-commit && forge install openzeppelin/openzeppelin-contracts@v4.8.3 --no-commit

# Update Dependencies
update:; forge update

build:; forge build

test :; forge test 

coverage :; forge coverage --report debug > coverage-report.txt

snapshot :; forge snapshot

format :; forge fmt

anvil :; anvil -m 'test test test test test test test test test test test junk' --steps-tracing --block-time 1

NETWORK_ARGS := --rpc-url http://localhost:8545 --private-key $(DEFAULT_ANVIL_KEY) --broadcast

# forge create --broadcast --rpc-url https://rpc.sepolia.ethpandaops.io --private-key YourPrivateKey src/ContractFile.sol:ContractName --verify --verifier etherscan --etherscan-api-key YourApiKeyToken

ifeq ($(findstring --network amoy,$(ARGS)),--network amoy)
	NETWORK_ARGS := --rpc-url $(AMOY_RPC_URL) --private-key $(PRIVATE_KEY_AMOY) --broadcast --verify --verifier etherscan --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif

ifeq ($(findstring --network arb,$(ARGS)),--network arb)
	NETWORK_ARGS := --rpc-url $(ARB_RPC_URL) --private-key $(PRIVATE_KEY_ARB) --broadcast --verify --verifier etherscan --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif

ifeq ($(findstring --network arb,$(ARGS)),--network arb)
	NETWORK_ARGS := --rpc-url $(ARB_RPC_URL) --private-key $(PRIVATE_KEY_ARB) --broadcast --verify --verifier etherscan --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif

ifeq ($(findstring --network base,$(ARGS)),--network base)
	NETWORK_ARGS := --rpc-url $(BASE_RPC_URL) --private-key $(PRIVATE_KEY_BASE) --broadcast --verify --verifier etherscan --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif

ifeq ($(findstring --network op,$(ARGS)),--network op)
	NETWORK_ARGS := --rpc-url $(OP_RPC_URL) --private-key $(PRIVATE_KEY_BASE) --broadcast --verify --verifier etherscan --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif

deploySource:
	@forge script script/DeploySource.s.sol:DeploySource $(NETWORK_ARGS)

deployReceiver:
	@forge script script/DeploySource.s.sol:DeployReceiver $(NETWORK_ARGS)

deployToken:
	@forge script script/DeploySource.s.sol:DeployToken $(NETWORK_ARGS)

deployEscrow:
	@forge script script/DeploySource.s.sol:DeployEscrow $(NETWORK_ARGS)

deployKwalaToken:
	@forge script script/DeploySource.s.sol:DeployKwalaTokenTest $(NETWORK_ARGS)
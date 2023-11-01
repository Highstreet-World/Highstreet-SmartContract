# Highstreet SmartContract

## Description

This repo contains the source code for all of Highstreet's smart contracts. We will update the latest version of contract and it’s audit report here.

Please refer to below for the directory layout. 

```jsx
├── contracts
│   ├── common                 
│   ├── mocks                  
│   ├── projects               
│   └── ...
├── test
│   ├── projects               
│   └── ...
├── reports                    
├── ...
└── README.md
```

## Test Scripts

In the test folder, you can find our test scripts for each project. 

You can easily check the test results by running the following command.

### Install

```jsx
npm install
```

### Run

```jsx
npx hardhat test
```

Set REPORT_GAS as true if you want to see more details about the gas usage. 

```jsx
REPORT_GAS=true npx hardhat test
```

## Audit Reports

Every smart contract produced by Highstreet undergoes an audit by our partner Halborn. If you are interested in its results, please refer to the reports in the 'report' directory.

import { rpcErrors } from '@metamask/rpc-errors';
import { CHAIN_IDS } from '../../../../../shared/constants/network';
import addEthereumChain from './add-ethereum-chain';

const NON_INFURA_CHAIN_ID = '0x123456789';

const createMockMainnetConfiguration = () => ({
  chainId: CHAIN_IDS.MAINNET,
  name: 'Ethereum Mainnet',
  defaultRpcEndpointIndex: 0,
  rpcEndpoints: [
    {
      networkClientId: 'mainnet',
      url: 'https://mainnet.infura.io/v3/',
      type: 'infura',
    },
  ],
  nativeCurrency: 'ETH',
  blockExplorerUrls: ['https://etherscan.io'],
  defaultBlockExplorerUrlIndex: 0,
});

const createMockOptimismConfiguration = () => ({
  chainId: CHAIN_IDS.OPTIMISM,
  name: 'Optimism',
  defaultRpcEndpointIndex: 0,
  rpcEndpoints: [
    {
      networkClientId: 'optimism-network-client-id',
      url: 'https://optimism.llamarpc.com',
      type: 'custom',
    },
  ],
  nativeCurrency: 'ETH',
  blockExplorerUrls: ['https://optimistic.etherscan.io'],
  defaultBlockExplorerUrlIndex: 0,
});

const createMockNonInfuraConfiguration = () => ({
  chainId: NON_INFURA_CHAIN_ID,
  name: 'Custom Network',
  defaultRpcEndpointIndex: 0,
  rpcEndpoints: [
    {
      name: 'Custom Network',
      url: 'https://custom.network',
      type: 'custom',
    },
  ],
  nativeCurrency: 'CUST',
  blockExplorerUrls: ['https://custom.blockexplorer'],
  defaultBlockExplorerUrlIndex: 0,
});

describe('addEthereumChainHandler', () => {
  const addEthereumChainHandler = addEthereumChain.implementation;
  const makeMocks = ({ permissionedChainIds = [], overrides = {} } = {}) => {
    return {
      getCurrentChainIdForDomain: jest
        .fn()
        .mockReturnValue(NON_INFURA_CHAIN_ID),
      setNetworkClientIdForDomain: jest.fn(),
      getNetworkConfigurationByChainId: jest.fn(),
      setActiveNetwork: jest.fn(),
      requestUserApproval: jest.fn().mockResolvedValue(123),
      requestPermittedChainsPermission: jest.fn(),
      grantPermittedChainsPermissionIncremental: jest.fn(),
      getCaveat: jest.fn().mockReturnValue({ value: permissionedChainIds }),
      startApprovalFlow: () => ({ id: 'approvalFlowId' }),
      endApprovalFlow: jest.fn(),
      addNetwork: jest.fn().mockResolvedValue({
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [{ networkClientId: 123 }],
      }),
      updateNetwork: jest.fn().mockResolvedValue({
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [{ networkClientId: 123 }],
      }),
      ...overrides,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a new network configuration for the given chainid, requests `endowment:permitted-chains` permission and switches to it if no networkConfigurations with the same chainId exist', async () => {
    const nonInfuraConfiguration = createMockNonInfuraConfiguration();

    const mocks = makeMocks({
      permissionedChainIds: [],
      overrides: {
        getCurrentChainIdForDomain: jest
          .fn()
          .mockReturnValue(CHAIN_IDS.MAINNET),
      },
    });
    await addEthereumChainHandler(
      {
        origin: 'example.com',
        params: [
          {
            chainId: nonInfuraConfiguration.chainId,
            chainName: nonInfuraConfiguration.name,
            rpcUrls: nonInfuraConfiguration.rpcEndpoints.map((rpc) => rpc.url),
            nativeCurrency: {
              symbol: nonInfuraConfiguration.nativeCurrency,
              decimals: 18,
            },
            blockExplorerUrls: nonInfuraConfiguration.blockExplorerUrls,
          },
        ],
      },
      {},
      jest.fn(),
      jest.fn(),
      mocks,
    );

    expect(mocks.addNetwork).toHaveBeenCalledWith(nonInfuraConfiguration);
    expect(
      mocks.grantPermittedChainsPermissionIncremental,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.grantPermittedChainsPermissionIncremental,
    ).toHaveBeenCalledWith([createMockNonInfuraConfiguration().chainId]);
    expect(mocks.setActiveNetwork).toHaveBeenCalledTimes(1);
    expect(mocks.setActiveNetwork).toHaveBeenCalledWith(123);
  });

  describe('if a networkConfiguration for the given chainId already exists', () => {
    describe('if the proposed networkConfiguration has a different rpcUrl from the one already in state', () => {
      it('create a new networkConfiguration and switches to it without requesting permissions, if the requested chainId has `endowment:permitted-chains` permission granted for requesting origin', async () => {
        const mocks = makeMocks({
          permissionedChainIds: [CHAIN_IDS.MAINNET],
          overrides: {
            getCurrentChainIdForDomain: jest
              .fn()
              .mockReturnValue(CHAIN_IDS.SEPOLIA),
          },
        });

        await addEthereumChainHandler(
          {
            origin: 'example.com',
            params: [
              {
                chainId: CHAIN_IDS.MAINNET,
                chainName: 'Ethereum Mainnet',
                rpcUrls: ['https://eth.llamarpc.com'],
                nativeCurrency: {
                  symbol: 'ETH',
                  decimals: 18,
                },
                blockExplorerUrls: ['https://etherscan.io'],
              },
            ],
          },
          {},
          jest.fn(),
          jest.fn(),
          mocks,
        );

        expect(mocks.requestUserApproval).toHaveBeenCalledTimes(1);
        expect(mocks.requestPermittedChainsPermission).not.toHaveBeenCalled();
        expect(mocks.setActiveNetwork).toHaveBeenCalledTimes(1);
        expect(mocks.setActiveNetwork).toHaveBeenCalledWith(123);
      });

      it('create a new networkConfiguration, requests permissions and switches to it, if the requested chainId does not have permittedChains permission granted for requesting origin', async () => {
        const mocks = makeMocks({
          permissionedChainIds: [],
          overrides: {
            getNetworkConfigurationByChainId: jest
              .fn()
              .mockReturnValue(createMockNonInfuraConfiguration()),
            getCurrentChainIdForDomain: jest
              .fn()
              .mockReturnValue(CHAIN_IDS.MAINNET),
          },
        });

        await addEthereumChainHandler(
          {
            origin: 'example.com',
            params: [
              {
                chainId: NON_INFURA_CHAIN_ID,
                chainName: 'Custom Network',
                rpcUrls: ['https://new-custom.network'],
                nativeCurrency: {
                  symbol: 'CUST',
                  decimals: 18,
                },
                blockExplorerUrls: ['https://custom.blockexplorer'],
              },
            ],
          },
          {},
          jest.fn(),
          jest.fn(),
          mocks,
        );

        expect(mocks.updateNetwork).toHaveBeenCalledTimes(1);
        expect(
          mocks.grantPermittedChainsPermissionIncremental,
        ).toHaveBeenCalledTimes(1);
        expect(
          mocks.grantPermittedChainsPermissionIncremental,
        ).toHaveBeenCalledWith([NON_INFURA_CHAIN_ID]);
        expect(mocks.setActiveNetwork).toHaveBeenCalledTimes(1);
      });
    });

    it('should switch to the existing networkConfiguration if one already exsits for the given chain id', async () => {
      const mocks = makeMocks({
        permissionedChainIds: [
          createMockOptimismConfiguration().chainId,
          CHAIN_IDS.MAINNET,
        ],
        overrides: {
          getCurrentChainIdForDomain: jest
            .fn()
            .mockReturnValue(CHAIN_IDS.MAINNET),
          getNetworkConfigurationByChainId: jest
            .fn()
            .mockReturnValue(createMockOptimismConfiguration()),
        },
      });

      await addEthereumChainHandler(
        {
          origin: 'example.com',
          params: [
            {
              chainId: createMockOptimismConfiguration().chainId,
              chainName: createMockOptimismConfiguration().name,
              rpcUrls: createMockOptimismConfiguration().rpcEndpoints.map(
                (rpc) => rpc.url,
              ),
              nativeCurrency: {
                symbol: createMockOptimismConfiguration().nativeCurrency,
                decimals: 18,
              },
              blockExplorerUrls:
                createMockOptimismConfiguration().blockExplorerUrls,
            },
          ],
        },
        {},
        jest.fn(),
        jest.fn(),
        mocks,
      );

      expect(mocks.requestPermittedChainsPermission).not.toHaveBeenCalled();
      expect(mocks.setActiveNetwork).toHaveBeenCalledTimes(1);
      expect(mocks.setActiveNetwork).toHaveBeenCalledWith(
        createMockOptimismConfiguration().rpcEndpoints[0].networkClientId,
      );
    });
  });

  it('should return an error if an unexpected parameter is provided', async () => {
    const mocks = makeMocks();
    const mockEnd = jest.fn();

    const unexpectedParam = 'unexpected';

    await addEthereumChainHandler(
      {
        origin: 'example.com',
        params: [
          {
            chainId: createMockNonInfuraConfiguration().chainId,
            chainName: createMockNonInfuraConfiguration().nickname,
            rpcUrls: [createMockNonInfuraConfiguration().rpcUrl],
            nativeCurrency: {
              symbol: createMockNonInfuraConfiguration().ticker,
              decimals: 18,
            },
            blockExplorerUrls: [
              createMockNonInfuraConfiguration().blockExplorerUrls[0],
            ],
            [unexpectedParam]: 'parameter',
          },
        ],
      },
      {},
      jest.fn(),
      mockEnd,
      mocks,
    );

    expect(mockEnd).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: `Received unexpected keys on object parameter. Unsupported keys:\n${unexpectedParam}`,
      }),
    );
  });

  it('should handle errors during the switch network permission request', async () => {
    const mockError = new Error('Permission request failed');
    const mocks = makeMocks({
      permissionedChainIds: [],
      overrides: {
        getCurrentChainIdForDomain: jest
          .fn()
          .mockReturnValue(CHAIN_IDS.SEPOLIA),
        grantPermittedChainsPermissionIncremental: jest
          .fn()
          .mockRejectedValue(mockError),
      },
    });
    const mockEnd = jest.fn();

    await addEthereumChainHandler(
      {
        origin: 'example.com',
        params: [
          {
            chainId: CHAIN_IDS.MAINNET,
            chainName: 'Ethereum Mainnet',
            rpcUrls: ['https://mainnet.infura.io/v3/'],
            nativeCurrency: {
              symbol: 'ETH',
              decimals: 18,
            },
            blockExplorerUrls: ['https://etherscan.io'],
          },
        ],
      },
      {},
      jest.fn(),
      mockEnd,
      mocks,
    );

    expect(
      mocks.grantPermittedChainsPermissionIncremental,
    ).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledWith(mockError);
    expect(mocks.setActiveNetwork).not.toHaveBeenCalled();
  });

  it('should return an error if nativeCurrency.symbol does not match an existing network with the same chainId', async () => {
    const mocks = makeMocks({
      permissionedChainIds: [CHAIN_IDS.MAINNET],
      overrides: {
        getNetworkConfigurationByChainId: jest
          .fn()
          .mockReturnValue(createMockMainnetConfiguration()),
      },
    });
    const mockEnd = jest.fn();

    await addEthereumChainHandler(
      {
        origin: 'example.com',
        params: [
          {
            chainId: CHAIN_IDS.MAINNET,
            chainName: 'Ethereum Mainnet',
            rpcUrls: ['https://mainnet.infura.io/v3/'],
            nativeCurrency: {
              symbol: 'WRONG',
              decimals: 18,
            },
            blockExplorerUrls: ['https://etherscan.io'],
          },
        ],
      },
      {},
      jest.fn(),
      mockEnd,
      mocks,
    );

    expect(mockEnd).toHaveBeenCalledWith(
      rpcErrors.invalidParams({
        message: `nativeCurrency.symbol does not match currency symbol for a network the user already has added with the same chainId. Received:\nWRONG`,
      }),
    );
  });

  it('should add result set to null to response object if the requested rpcUrl (and chainId) is currently selected', async () => {
    const CURRENT_RPC_CONFIG = createMockNonInfuraConfiguration();

    const mocks = makeMocks({
      overrides: {
        getCurrentChainIdForDomain: jest
          .fn()
          .mockReturnValue(CURRENT_RPC_CONFIG.chainId),
        getNetworkConfigurationByChainId: jest
          .fn()
          .mockReturnValue(CURRENT_RPC_CONFIG),
      },
    });
    const res = {};

    await addEthereumChainHandler(
      {
        origin: 'example.com',
        params: [
          {
            chainId: CURRENT_RPC_CONFIG.chainId,
            chainName: 'Custom Network',
            rpcUrls: [CURRENT_RPC_CONFIG.rpcEndpoints[0].url],
            nativeCurrency: {
              symbol: CURRENT_RPC_CONFIG.nativeCurrency,
              decimals: 18,
            },
            blockExplorerUrls: ['https://custom.blockexplorer'],
          },
        ],
      },
      res,
      jest.fn(),
      jest.fn(),
      mocks,
    );
    expect(res.result).toBeNull();
  });
});

import {
  ChainId,
  CurrencyAmount,
  JSBI,
  Token,
  TokenAmount,
  Trade
} from '@gravis.finance/sdk'
import { Button, CardBody, Flex, Spinner, Text } from '@gravis.finance/uikit'
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { ArrowDown } from 'react-feather'
import { useTranslation } from 'react-i18next'
import styled, { ThemeContext } from 'styled-components'

import AddressInputPanel from 'components/AddressInputPanel'
import Card from 'components/Card'
import CardNav from 'components/CardNav'
import { AutoColumn } from 'components/Column'
import ConnectWalletButton from 'components/ConnectWalletButton'
import CurrencyInputPanel from 'components/CurrencyInputPanel'
import PageHeader from 'components/PageHeader'
import ProgressSteps from 'components/ProgressSteps'
import { AutoRow, RowBetween } from 'components/Row'
import { LinkStyledButton, TYPE } from 'components/Shared'
import TokenWarningModal from 'components/TokenWarningModal'
import AdvancedSwapDetailsDropdown from 'components/swap/AdvancedSwapDetailsDropdown'
import ConfirmSwapModal from 'components/swap/ConfirmSwapModal'
import TradePrice from 'components/swap/TradePrice'
import confirmPriceImpactWithoutFee from 'components/swap/confirmPriceImpactWithoutFee'
import {
  ArrowWrapper,
  BottomGrouping,
  SwapCallbackError,
  Wrapper
} from 'components/swap/styleds'
import { INITIAL_ALLOWED_SLIPPAGE } from 'config/settings'
import { DATA_LAYER_EVENTS } from 'constants/data-layer-events'
import { useActiveWeb3React } from 'hooks'
import { useCurrency } from 'hooks/Tokens'
import {
  ApprovalState,
  useApproveCallbackFromTrade
} from 'hooks/useApproveCallback'
import { useSwapCallback } from 'hooks/useSwapCallback'
import useWrapCallback, { WrapType } from 'hooks/useWrapCallback'
import { Field } from 'state/swap/actions'
import {
  useDefaultsFromURLSearch,
  useDerivedSwapInfo,
  useSwapActionHandlers,
  useSwapState
} from 'state/swap/hooks'
import {
  useExpertModeManager,
  useUserDeadline,
  useUserSlippageTolerance
} from 'state/user/hooks'
import { addDataLayerEvent } from 'utils/addDataLayerEvent'
import { computeTradePriceBreakdown, warningSeverity } from 'utils/prices'

import { ReactComponent as ExchangeIcon } from '../../assets/svg/exchange-icon.svg'
import { usePair } from '../../data/Reserves'
import { getMulticallFetchedState } from '../../state/multicall/hooks'
import { useAllTransactions } from '../../state/transactions/hooks'
import AppBody from '../AppBody'
import TokenInPoolValue from './TokenInPoolValue'

const { main: Main } = TYPE

const CardWrapper = styled.div`
  width: 100%;
`

const StyledIconButton = styled.button<{ reversed?: boolean }>`
  outline: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  transition: 0.4s;
  background: linear-gradient(96.62deg, #292929 22.57%, #242424 80.28%);
  border: 1px solid #2e2e2e;
  box-sizing: border-box;
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.4),
    -4px -4px 12px rgba(255, 255, 255, 0.05);
  border-radius: 35px;
  > svg {
    transition: 250ms;
    ${({ reversed }) => (reversed ? 'transform: rotate(180deg);' : '')}
  }
  :hover {
    background: linear-gradient(90.28deg, #242424 0%, #202020 100%);

    // & svg path {
    //   stroke: #fff;
    // }
  }
`

const StyledCardBody = styled.div`
  > div {
    padding: 40px 24px 24px 24px;
  }
  @media screen and (max-width: 376px) {
    > div {
      padding: 36px 16px 16px 16px;
    }
  }
`

const StyledRowBetween = styled(RowBetween)`
  @media screen and (max-width: 530px) {
    flex-direction: column;
    > button {
      width: 100% !important;
      :first-child {
        margin-bottom: 8px;
      }
    }
  }
`

const SpinnerContainer = styled.div`
  display: flex;
  width: 100%;
  > * {
    margin: auto;
  }
`

const StyledAutoRow = styled(AutoRow)`
  > div {
    flex: 1;

    &:nth-child(2) {
      display: flex;
      justify-content: center;
    }

    &:nth-child(3) {
      align-self: baseline;
      display: flex;
      justify-content: flex-end;
    }
  }
`

const WARNING_IGNORE_TOKENS = ['GRVS', 'GRVX']

const Swap = () => {
  const loadedUrlParams = useDefaultsFromURLSearch()

  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.inputCurrencyId),
    useCurrency(loadedUrlParams?.outputCurrencyId)
  ]
  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false)
  const urlLoadedTokens: Token[] = useMemo(
    () =>
      [loadedInputCurrency, loadedOutputCurrency]?.filter(
        (c): c is Token => c instanceof Token
      ) ?? [],
    [loadedInputCurrency, loadedOutputCurrency]
  )
  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
  }, [])

  const { account, chainId } = useActiveWeb3React()
  const theme = useContext(ThemeContext) as any

  const [isExpertMode] = useExpertModeManager()

  const { t } = useTranslation()

  // get custom setting values for user
  const [deadline] = useUserDeadline()
  const [allowedSlippage] = useUserSlippageTolerance()

  // swap state
  const { independentField, typedValue, recipient } = useSwapState()
  const {
    v2Trade,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError
  } = useDerivedSwapInfo()

  const {
    wrapType,
    execute: onWrap,
    inputError: wrapInputError
  } = useWrapCallback(
    currencies[Field.INPUT],
    currencies[Field.OUTPUT],
    typedValue
  )
  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE
  //   const { address: recipientAddress } = useENSAddress(recipient)
  const trade = showWrap ? undefined : v2Trade

  const parsedAmounts = showWrap
    ? {
        [Field.INPUT]: parsedAmount,
        [Field.OUTPUT]: parsedAmount
      }
    : {
        [Field.INPUT]:
          independentField === Field.INPUT ? parsedAmount : trade?.inputAmount,
        [Field.OUTPUT]:
          independentField === Field.OUTPUT ? parsedAmount : trade?.outputAmount
      }

  const {
    onSwitchTokens,
    onCurrencySelection,
    onUserInput,
    onChangeRecipient
  } = useSwapActionHandlers()
  const isValid = !swapInputError
  const dependentField: Field =
    independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value)
    },
    [onUserInput]
  )
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value)
    },
    [onUserInput]
  )

  // modal and loading
  const [
    { showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash },
    setSwapState
  ] = useState<{
    showConfirm: boolean
    tradeToConfirm: Trade | undefined
    attemptingTxn: boolean
    swapErrorMessage: string | undefined
    txHash: string | undefined
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined
  })

  // const filterTypedAmount = (providedTypedValue) => {
  //   const endSymbolIsDot = providedTypedValue.slice(providedTypedValue.length - 1, providedTypedValue.length) === '.'
  //   const includesDot = providedTypedValue.includes('.')
  //   console.log(includesDot)
  //   if (endSymbolIsDot) return providedTypedValue
  //   if (includesDot && providedTypedValue.split('.')[1].length > 0)
  //     if (
  //       providedTypedValue
  //         .split('.')[1]
  //         .split('')
  //         .every((symbol) => symbol === '0')
  //     )
  //       return providedTypedValue
  //   return Number(providedTypedValue).toString()
  // }

  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: showWrap
      ? parsedAmounts[independentField]?.toExact() ?? ''
      : parsedAmounts[dependentField]?.toSignificant(6) ?? ''
  }

  const route = trade?.route
  const userHasSpecifiedInputOutput = Boolean(
    currencies[Field.INPUT] &&
      currencies[Field.OUTPUT] &&
      parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0))
  )
  const noRoute = !route

  // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallbackFromTrade(
    trade,
    allowedSlippage
  )

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false)

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true)
    }
  }, [approval, approvalSubmitted])

  const maxAmountInput: CurrencyAmount | undefined =
    currencyBalances[Field.INPUT]
  const atMaxAmountInput = Boolean(
    maxAmountInput && parsedAmounts[Field.INPUT]?.equalTo(maxAmountInput)
  )

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapCallback(
    trade,
    allowedSlippage,
    deadline,
    recipient
  )

  // get tokens in pool
  const [, pair] = usePair(
    currencies[Field.INPUT] ?? undefined,
    currencies[Field.OUTPUT] ?? undefined
  )
  const {
    reserve0,
    reserve1
  }: { reserve0?: TokenAmount; reserve1?: TokenAmount } =
    trade?.route?.path.length === 2 && !!pair ? pair : {}

  const { priceImpactWithoutFee } = computeTradePriceBreakdown(
    chainId as ChainId,
    trade
  )

  const handleSwap = useCallback(() => {
    if (
      priceImpactWithoutFee &&
      !confirmPriceImpactWithoutFee(priceImpactWithoutFee, t)
    ) {
      return
    }
    if (!swapCallback) {
      return
    }
    setSwapState((prevState) => ({
      ...prevState,
      attemptingTxn: true,
      swapErrorMessage: undefined,
      txHash: undefined
    }))
    swapCallback()
      .then((hash) => {
        addDataLayerEvent(DATA_LAYER_EVENTS.SWAP)
        setSwapState((prevState) => ({
          ...prevState,
          attemptingTxn: false,
          swapErrorMessage: undefined,
          txHash: hash
        }))
      })
      .catch((error) => {
        setSwapState((prevState) => ({
          ...prevState,
          attemptingTxn: false,
          swapErrorMessage: error.message,
          txHash: undefined
        }))
      })
  }, [t, priceImpactWithoutFee, swapCallback, setSwapState])

  const transactions = useAllTransactions()

  useEffect(() => {
    if (txHash)
      if (transactions[txHash]?.receipt)
        setSwapState((prevState) => ({
          ...prevState,
          showConfirm: false
        }))
  }, [txHash, transactions])

  // errors
  const [showInverted, setShowInverted] = useState<boolean>(false)

  const [rotated, setRotated] = useState(false)

  // warnings on slippage
  const priceImpactSeverity = warningSeverity(priceImpactWithoutFee)

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED)) &&
    !(priceImpactSeverity > 3 && !isExpertMode)

  const handleConfirmDismiss = useCallback(() => {
    setSwapState((prevState) => ({ ...prevState, showConfirm: false }))

    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, '')
    }
  }, [onUserInput, txHash, setSwapState])

  const handleAcceptChanges = useCallback(() => {
    setSwapState((prevState) => ({ ...prevState, tradeToConfirm: trade }))
  }, [trade])

  const handleInputSelect = useCallback(
    (inputCurrency) => {
      setApprovalSubmitted(false) // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, inputCurrency)
    },
    [onCurrencySelection, setApprovalSubmitted]
  )

  const handleMaxInput = useCallback(() => {
    if (maxAmountInput) {
      onUserInput(Field.INPUT, maxAmountInput.toExact())
    }
  }, [maxAmountInput, onUserInput])

  const handleOutputSelect = useCallback(
    (outputCurrency) => {
      onCurrencySelection(Field.OUTPUT, outputCurrency)
    },
    [onCurrencySelection]
  )

  const fetchedBlock = getMulticallFetchedState()

  return (
    <CardWrapper>
      <TokenWarningModal
        isOpen={
          urlLoadedTokens.length > 0 &&
          !dismissTokenWarning &&
          !urlLoadedTokens.find(
            (token) =>
              token.symbol && WARNING_IGNORE_TOKENS.includes(token.symbol)
          )
        }
        tokens={urlLoadedTokens}
        onConfirm={handleConfirmTokenWarning}
      />
      <CardNav />
      <AppBody withoutBorderBottom={Boolean(trade)}>
        <Wrapper id="swap-page">
          <ConfirmSwapModal
            isOpen={showConfirm}
            trade={trade}
            originalTrade={tradeToConfirm}
            onAcceptChanges={handleAcceptChanges}
            attemptingTxn={attemptingTxn}
            txHash={txHash}
            recipient={recipient}
            allowedSlippage={allowedSlippage}
            onConfirm={handleSwap}
            swapErrorMessage={swapErrorMessage}
            onDismiss={handleConfirmDismiss}
          />
          <PageHeader
            title={t('swap')}
            description={t('swapHeaderDescription')}
          />
          <StyledCardBody>
            <CardBody>
              <AutoColumn gap="md">
                <CurrencyInputPanel
                  label={
                    independentField === Field.OUTPUT && !showWrap && trade
                      ? t('fromEstimated')
                      : t('from')
                  }
                  value={formattedAmounts[Field.INPUT]}
                  showMaxButton={!atMaxAmountInput}
                  currency={currencies[Field.INPUT]}
                  onUserInput={handleTypeInput}
                  onMax={handleMaxInput}
                  onCurrencySelect={handleInputSelect}
                  otherCurrency={currencies[Field.OUTPUT]}
                  id="swap-currency-input"
                  showCommonBases
                  idForBalance="token1-balance-amount"
                />
                <AutoColumn justify="space-between">
                  <StyledAutoRow
                    justify="space-between"
                    style={{ padding: '0 1rem' }}
                  >
                    <div />
                    <div>
                      <ArrowWrapper clickable>
                        <StyledIconButton
                          onClick={() => {
                            setApprovalSubmitted(false) // reset 2 step UI for approvals
                            onSwitchTokens()
                            setRotated(!rotated)
                          }}
                          data-id="revert-trade-button"
                          reversed={rotated}
                        >
                          <ExchangeIcon />
                        </StyledIconButton>
                      </ArrowWrapper>
                      {recipient === null && !showWrap && isExpertMode ? (
                        <LinkStyledButton
                          id="add-recipient-button"
                          onClick={() => onChangeRecipient('')}
                        >
                          + Add a send (optional)
                        </LinkStyledButton>
                      ) : null}
                    </div>
                    <div>
                      <TokenInPoolValue value={reserve0} />
                    </div>
                  </StyledAutoRow>
                </AutoColumn>
                <CurrencyInputPanel
                  value={formattedAmounts[Field.OUTPUT]}
                  onUserInput={handleTypeOutput}
                  label={
                    independentField === Field.INPUT && !showWrap && trade
                      ? t('toEstimated')
                      : t('upperTo')
                  }
                  showMaxButton={false}
                  currency={currencies[Field.OUTPUT]}
                  onCurrencySelect={handleOutputSelect}
                  otherCurrency={currencies[Field.INPUT]}
                  showCommonBases
                  id="swap-currency-output"
                  idForBalance="token2-balance-amount"
                />
                <TokenInPoolValue value={reserve1} pr="1rem" />

                {recipient !== null && !showWrap ? (
                  <>
                    <AutoRow
                      justify="space-between"
                      style={{ padding: '0 1rem' }}
                    >
                      <ArrowWrapper clickable={false}>
                        <ArrowDown size="16" color={theme.colors.textSubtle} />
                      </ArrowWrapper>
                      <LinkStyledButton
                        id="remove-recipient-button"
                        onClick={() => onChangeRecipient(null)}
                      >
                        - Remove send
                      </LinkStyledButton>
                    </AutoRow>
                    <AddressInputPanel
                      id="recipient"
                      value={recipient}
                      onChange={onChangeRecipient}
                    />
                  </>
                ) : null}

                {showWrap ? null : (
                  <Card padding="8px 0 8px 0" borderRadius="20px">
                    <AutoColumn gap="8px">
                      {Boolean(trade) && (
                        <AutoRow align="center">
                          <Text
                            fontSize="14px"
                            paddingRight="8px"
                            color="#909090"
                          >
                            {t('price')}
                          </Text>
                          <TradePrice
                            price={trade?.executionPrice}
                            showInverted={showInverted}
                            setShowInverted={setShowInverted}
                            warning={
                              priceImpactSeverity === 3 ||
                              priceImpactSeverity === 4
                            }
                          />
                        </AutoRow>
                      )}
                      {allowedSlippage !== INITIAL_ALLOWED_SLIPPAGE && (
                        <Flex alignItems="center" justifyContent="flex-start">
                          <Text fontSize="14px" color="#909090">
                            {t('slippageTolerance')}
                          </Text>
                          <Text
                            fontSize="14px"
                            style={{ marginLeft: 10, color: '#009CE1' }}
                          >
                            {allowedSlippage / 100}%
                          </Text>
                        </Flex>
                      )}
                    </AutoColumn>
                  </Card>
                )}
              </AutoColumn>
              <BottomGrouping>
                {!account ? (
                  <ConnectWalletButton />
                ) : showWrap ? (
                  <Button
                    disabled={Boolean(wrapInputError)}
                    onClick={onWrap}
                    data-id="wrap-button"
                  >
                    {wrapInputError ??
                      (wrapType === WrapType.WRAP
                        ? 'Wrap'
                        : wrapType === WrapType.UNWRAP
                        ? 'Unwrap'
                        : null)}
                  </Button>
                ) : currencies.INPUT &&
                  !currencies.OUTPUT &&
                  formattedAmounts[Field.INPUT] ? (
                  <Card style={{ textAlign: 'center' }}>
                    <Main style={{ color: '#909090' }}>
                      {t('provideSecondToken')}
                    </Main>
                  </Card>
                ) : (!currencyBalances.INPUT || !currencyBalances.OUTPUT) &&
                  (formattedAmounts[Field.INPUT] ||
                    formattedAmounts[Field.OUTPUT]) &&
                  currencies.OUTPUT &&
                  currencies.INPUT ? (
                  <SpinnerContainer>
                    <Spinner size={88} />
                  </SpinnerContainer>
                ) : !fetchedBlock && formattedAmounts[Field.INPUT] ? (
                  <Card style={{ textAlign: 'center' }}>
                    <Main style={{ color: '#909090' }}>
                      {t('readingBlockchain')}
                    </Main>
                  </Card>
                ) : noRoute && userHasSpecifiedInputOutput ? (
                  <Card style={{ textAlign: 'center' }}>
                    <Main style={{ color: '#909090' }}>
                      {t('insufficientLiquidityForThisTrade')}
                    </Main>
                  </Card>
                ) : showApproveFlow ? (
                  <StyledRowBetween>
                    <Button
                      onClick={approveCallback}
                      disabled={
                        approval !== ApprovalState.NOT_APPROVED ||
                        approvalSubmitted
                      }
                      style={{ width: '48%' }}
                      variant={
                        approval === ApprovalState.APPROVED
                          ? 'success'
                          : 'primary'
                      }
                      data-id="approve-button"
                    >
                      {approval === ApprovalState.PENDING ? (
                        <AutoRow gap="6px" justify="center">
                          Approving <Spinner size={30} />
                        </AutoRow>
                      ) : approvalSubmitted &&
                        approval === ApprovalState.APPROVED ? (
                        t('approve')
                      ) : (
                        `${t('approved')} ${currencies[Field.INPUT]?.symbol}`
                      )}
                    </Button>
                    <Button
                      onClick={() => {
                        if (isExpertMode) {
                          handleSwap()
                        } else {
                          setSwapState({
                            tradeToConfirm: trade,
                            attemptingTxn: false,
                            swapErrorMessage: undefined,
                            showConfirm: true,
                            txHash: undefined
                          })
                        }
                      }}
                      style={{ width: '48%' }}
                      data-id="swap-button"
                      /* disabled={
                        !isValid ||
                        approval !== ApprovalState.APPROVED ||
                        (priceImpactSeverity > 3 && !isExpertMode)
                      } */
                      variant={
                        isValid && priceImpactSeverity > 2
                          ? 'danger'
                          : 'primary'
                      }
                    >
                      {priceImpactSeverity > 3 && !isExpertMode
                        ? t('priceImpactTooHigh')
                        : priceImpactSeverity > 2
                        ? t('swapAnyway')
                        : t('swap')}
                    </Button>
                  </StyledRowBetween>
                ) : (
                  <Button
                    onClick={() => {
                      if (isExpertMode) {
                        handleSwap()
                      } else {
                        setSwapState({
                          tradeToConfirm: trade,
                          attemptingTxn: false,
                          swapErrorMessage: undefined,
                          showConfirm: true,
                          txHash: undefined
                        })
                      }
                    }}
                    data-id="swap-button"
                    /* disabled={
                      !isValid ||
                      (priceImpactSeverity > 3 && !isExpertMode) ||
                      !!swapCallbackError
                    } */
                    variant={
                      isValid && priceImpactSeverity > 2 && !swapCallbackError
                        ? 'danger'
                        : 'primary'
                    }
                  >
                    {swapInputError ||
                      (priceImpactSeverity > 3 && !isExpertMode
                        ? t('priceImpactTooHigh')
                        : priceImpactSeverity > 2
                        ? t('swapAnyway')
                        : t('swap'))}
                  </Button>
                )}
                {showApproveFlow && (
                  <ProgressSteps
                    steps={[approval === ApprovalState.APPROVED]}
                  />
                )}
                {/* <ProgressSteps steps={[approval === ApprovalState.APPROVED]} /> */}
                {isExpertMode && swapErrorMessage ? (
                  <SwapCallbackError error={swapErrorMessage} />
                ) : null}
              </BottomGrouping>
            </CardBody>
          </StyledCardBody>
        </Wrapper>
      </AppBody>
      <AdvancedSwapDetailsDropdown trade={trade} pair={pair} />
    </CardWrapper>
  )
}

export default Swap

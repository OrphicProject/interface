import { Currency, BASE_CURRENCIES, Token, ChainId } from '@gravis.finance/sdk'
import { useActiveWeb3React } from 'hooks'
import React, { useMemo } from 'react'
import styled from 'styled-components'
import BNBLogo from '../../../assets/images/binance-logo.png'
import HTlogo from '../../../assets/images/heco-logo.png'
import MATIClogo from '../../../assets/images/matic-logo.png'
import useHttpLocations from '../../../hooks/useHttpLocations'
import { WrappedTokenInfo } from '../../../state/lists/hooks'
import Logo from '../Logo'
import CoinLogo from '../../Gravis/CoinLogo'

const BaseLogo: { [chainId in ChainId]: string } = {
  [ChainId.MAINNET]: BNBLogo,
  [ChainId.BSCTESTNET]: BNBLogo,
  [ChainId.HECOMAINNET]: HTlogo,
  [ChainId.HECOTESTNET]: HTlogo,
  [ChainId.MATICMAINNET]: MATIClogo,
  [ChainId.MATICTESTNET]: MATIClogo,
}

const getTokenLogoURL = (address: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${address}/logo.png`

const StyledEthereumLogo = styled.img<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  border-radius: 100%;
  background-color: #404040;
`

const StyledLogo = styled(Logo)<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  background-color: #404040;
  padding: 4px;
`

export default function CurrencyLogo({
  currency,
  size = '24px',
  style,
}: {
  currency?: Currency
  size?: string
  style?: React.CSSProperties
}) {
  const { chainId } = useActiveWeb3React()
  const uriLocations = useHttpLocations(currency instanceof WrappedTokenInfo ? currency.logoURI : undefined)

  const srcs: string[] = useMemo(() => {
    if (currency === BASE_CURRENCIES[chainId as ChainId]) return []

    if (currency instanceof Token) {
      if (currency instanceof WrappedTokenInfo) {
        return [...uriLocations, `/images/coins/${currency?.symbol ?? 'token'}.png`, getTokenLogoURL(currency.address)]
      }

      return [`/images/coins/${currency?.symbol ?? 'token'}.png`, getTokenLogoURL(currency.address)]
    }
    return []
  }, [currency, uriLocations, chainId])

  if (currency === BASE_CURRENCIES[chainId as ChainId]) {
    return <StyledEthereumLogo src={chainId && BaseLogo[chainId]} size={size} style={style} />
  }

  return (currency as any)?.symbol ? (
    <CoinLogo size={size} srcs={srcs} alt={`${currency?.symbol ?? 'token'} logo`} style={style} />
  ) : (
    // <FilledHelp height="24px" width="24px" mr="8px" />
    <StyledLogo size={size} srcs={srcs} alt={`${currency?.symbol ?? 'token'} logo`} style={style} />
  )
}

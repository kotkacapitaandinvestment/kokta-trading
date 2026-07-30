import { useEffect, useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardHeader, CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { ArrowUpRight, ArrowDownRight, Newspaper } from 'lucide-react';
import { api } from '../../lib/api';

const liquidityZones = [
  { symbol: 'EUR/USD', zone: '1.0790 – 1.0805', type: 'Buy-side liquidity (equal lows)' },
  { symbol: 'XAU/USD', zone: '2425 – 2432', type: 'Sell-side liquidity (daily high sweep)' },
  { symbol: 'NAS100', zone: '18,050 – 18,090', type: 'Untested order block (4H)' },
  { symbol: 'US30', zone: '39,600 – 39,650', type: 'Fair value gap (1H)' },
];

const correlationPairs = [
  { pair: 'EUR/USD ↔ GBP/USD', value: 0.86 },
  { pair: 'EUR/USD ↔ XAU/USD', value: 0.41 },
  { pair: 'XAU/USD ↔ DXY', value: -0.78 },
  { pair: 'US30 ↔ NAS100', value: 0.91 },
  { pair: 'BTC/USD ↔ NAS100', value: 0.58 },
];

const commentary = [
  'Institutional order flow suggests accumulation below 1.0800 on EUR/USD ahead of this week\'s NFP print — treat downside moves into that zone as potential liquidity grabs rather than confirmed breakdowns.',
  'Gold\'s failure to hold above 2425 on declining volume points to distribution at the highs. Watch for a sweep of the 2412 mid-range before any continuation higher.',
  'Index futures are pricing a dovish tilt into the next rate decision — correlation with DXY has weakened, which historically precedes a volatility expansion.',
];

function CorrelationBar({ value }) {
  const pct = Math.abs(value) * 100;
  const positive = value >= 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
      <div
        className={`h-full rounded-full ${positive ? 'bg-profit-500' : 'bg-loss-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatATR(v) {
  if (v.atr === null) return '—';
  if (v.symbol.includes('/')) {
    // FX / metals quoted as price differences
    if (v.symbol === 'XAU/USD') return `$${v.atr.toFixed(2)}`;
    if (v.symbol === 'BTC/USD') return `$${v.atr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const pipMultiplier = v.symbol.endsWith('JPY') ? 100 : 10000;
    return `${Math.round(v.atr * pipMultiplier)} pips`;
  }
  return `${v.atr.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts`;
}

export default function MarketIntelligence() {
  const [market, setMarket] = useState(null);

  useEffect(() => {
    api.get('/market/snapshot').then(setMarket);
  }, []);

  const watchlistAllLive = market?.watchlist?.length > 0 && market.watchlist.every((w) => w.live);
  const volatilityAllLive = market?.volatility?.length > 0 && market.volatility.every((v) => v.live);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Market Intelligence"
        description="Structure, sentiment, and institutional context across every market you trade."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Watchlist" action={watchlistAllLive ? <Badge tone="profit">Live</Badge> : null} />
          <CardBody className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {!market ? (
              <p className="py-6 text-center text-sm text-ink-400">Loading…</p>
            ) : (
              market.watchlist.map((w) => (
                <div key={w.symbol} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-1.5">
                    <div>
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{w.symbol}</p>
                      <p className="text-xs text-ink-400">{w.market}</p>
                    </div>
                    {!w.live ? (
                      <span className="rounded bg-ink-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-400 dark:bg-ink-800">
                        sample
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{w.price ?? '—'}</p>
                    {w.change !== null ? (
                      <p className={`flex items-center justify-end gap-0.5 text-xs font-medium ${w.change >= 0 ? 'text-profit-600 dark:text-profit-400' : 'text-loss-500'}`}>
                        {w.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(w.change)}%
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Market Sentiment"
            subtitle={market?.sentimentLive ? "Derived from your watchlist's real price moves" : undefined}
            action={!market?.sentimentLive ? <Badge tone="warning">Sample data</Badge> : <Badge tone="profit">Live</Badge>}
          />
          <CardBody className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
                <span>Bearish</span>
                <span>Bullish</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gradient-to-r from-loss-400 via-ink-100 to-profit-500">
                <div className="h-full w-0.5 bg-ink-900 dark:bg-white" style={{ marginLeft: `${market?.sentiment?.overall ?? 50}%` }} />
              </div>
              <p className="mt-2 text-center text-sm font-medium text-ink-700 dark:text-ink-200">{market?.sentiment?.overall ?? '—'}/100 overall</p>
            </div>
            <div className="space-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
              {market?.sentiment?.breakdown?.map((m) => (
                <div key={m.market} className="flex items-center justify-between text-xs">
                  <span className="text-ink-500 dark:text-ink-400">{m.market}</span>
                  <span className="font-medium text-ink-700 dark:text-ink-200">{m.sentiment}/100</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Economic Calendar"
            subtitle="High and medium impact events, today"
            action={!market?.economicEventsLive ? <Badge tone="warning">Sample data</Badge> : <Badge tone="profit">Live</Badge>}
          />
          <CardBody className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {!market?.economicEvents?.length ? (
              <p className="py-6 text-center text-sm text-ink-400">No high-impact events found for today.</p>
            ) : (
              market.economicEvents.map((e, i) => (
                <div key={e.title + i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{e.title}</p>
                    <p className="text-xs text-ink-400">
                      {e.time} · {e.currency}
                      {e.forecast !== undefined ? ` · Forecast ${e.forecast} / Prev ${e.previous}` : ''}
                    </p>
                  </div>
                  <Badge tone={e.impact === 'high' ? 'loss' : 'warning'}>{e.impact}</Badge>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Liquidity Zones" subtitle="Where price is likely engineered to reach" action={<Badge tone="warning">Sample data</Badge>} />
          <CardBody className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {liquidityZones.map((z) => (
              <div key={z.symbol + z.zone} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{z.symbol}</p>
                  <p className="text-xs text-ink-400">{z.type}</p>
                </div>
                <Badge tone="accent">{z.zone}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Volatility Overview"
            subtitle="14-day average true range & regime"
            action={volatilityAllLive ? <Badge tone="profit">Live</Badge> : <Badge tone="warning">Sample data</Badge>}
          />
          <CardBody className="divide-y divide-ink-50 dark:divide-ink-800/60">
            {!market?.volatility?.length ? (
              <p className="py-6 text-center text-sm text-ink-400">Configure the Massive integration to see real volatility.</p>
            ) : (
              market.volatility.map((v) => (
                <div key={v.symbol} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{v.symbol}</p>
                    {!v.live ? (
                      <span className="rounded bg-ink-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-400 dark:bg-ink-800">
                        sample
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-400">{formatATR(v)}</span>
                    {v.regime ? (
                      <Badge tone={v.regime === 'High' ? 'loss' : v.regime === 'Elevated' ? 'warning' : 'neutral'}>{v.regime}</Badge>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Correlation Matrix" subtitle="30-day rolling correlation" action={<Badge tone="warning">Sample data</Badge>} />
          <CardBody className="space-y-3">
            {correlationPairs.map((c) => (
              <div key={c.pair}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-600 dark:text-ink-300">{c.pair}</span>
                  <span className="font-medium text-ink-400">{c.value.toFixed(2)}</span>
                </div>
                <CorrelationBar value={c.value} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Institutional Commentary" action={<Newspaper className="mt-0.5 h-4 w-4 text-ink-300" />} />
        <CardBody className="space-y-3">
          {commentary.map((c, i) => (
            <p key={i} className="rounded-xl bg-ink-50 p-3 text-sm leading-relaxed text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              {c}
            </p>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

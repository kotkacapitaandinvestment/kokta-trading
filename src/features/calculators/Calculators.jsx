import { useState } from 'react';
import clsx from 'clsx';
import { Percent, Layers, Scale, Ruler, Target, DollarSign, TrendingUp, TrendingDown, Landmark } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Hint from '../../components/ui/Hint';
import Card from '../../components/ui/Card';
import RiskCalculator from './tools/RiskCalculator';
import LotSizeCalculator from './tools/LotSizeCalculator';
import RiskRewardCalculator from './tools/RiskRewardCalculator';
import PipCalculator from './tools/PipCalculator';
import PositionSizeCalculator from './tools/PositionSizeCalculator';
import ProfitCalculator from './tools/ProfitCalculator';
import CompoundingCalculator from './tools/CompoundingCalculator';
import DrawdownCalculator from './tools/DrawdownCalculator';
import MarginCalculator from './tools/MarginCalculator';

const tools = [
  { id: 'risk', label: 'Risk Calculator', icon: Percent, component: RiskCalculator },
  { id: 'lot', label: 'Lot Size Calculator', icon: Layers, component: LotSizeCalculator },
  { id: 'rr', label: 'Risk/Reward Calculator', icon: Scale, component: RiskRewardCalculator },
  { id: 'pip', label: 'Pip Calculator', icon: Ruler, component: PipCalculator },
  { id: 'position', label: 'Position Size Calculator', icon: Target, component: PositionSizeCalculator },
  { id: 'profit', label: 'Profit Calculator', icon: DollarSign, component: ProfitCalculator },
  { id: 'compounding', label: 'Compounding Calculator', icon: TrendingUp, component: CompoundingCalculator },
  { id: 'drawdown', label: 'Drawdown Calculator', icon: TrendingDown, component: DrawdownCalculator },
  { id: 'margin', label: 'Margin Calculator', icon: Landmark, component: MarginCalculator },
];

export default function Calculators() {
  const [active, setActive] = useState(tools[0].id);
  const ActiveTool = tools.find((t) => t.id === active)?.component;
  const activeLabel = tools.find((t) => t.id === active)?.label;

  return (
    <div>
      <PageHeader
        eyebrow="Tools"
        title="Calculators"
        description="Precision math for risk, sizing, and growth, because guessing is not a strategy."
      />

      <Hint id="calc-position" className="mb-5 max-w-2xl">
        Sizing a trade? <button type="button" onClick={() => setActive('position')} className="font-medium text-ink-700 underline-offset-2 hover:underline dark:text-ink-200">Position Size</button> takes your entry, stop and risk % and gives the size that keeps a loss at that risk.
      </Hint>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-4">
        {/* Phones: a swipeable row of tools; from lg, a list beside the tool. */}
        <Card className="-mx-4 rounded-none border-x-0 p-2 sm:mx-0 sm:rounded-2xl sm:border-x lg:col-span-1">
          <ul className="flex gap-1 overflow-x-auto scrollbar-thin lg:block lg:space-y-0.5 lg:overflow-visible">
            {tools.map((t) => (
              <li key={t.id} className="shrink-0">
                <button
                  onClick={() => setActive(t.id)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors lg:py-2.5',
                    active === t.id
                      ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
                      : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  <t.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  <span className="lg:hidden">{t.label.replace(' Calculator', '')}</span>
                  <span className="hidden lg:inline">{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6 lg:col-span-3">
          <h3 className="mb-5 text-sm font-semibold text-ink-900 dark:text-ink-50 sm:mb-6">{activeLabel}</h3>
          {ActiveTool ? <ActiveTool /> : null}
        </Card>
      </div>
    </div>
  );
}

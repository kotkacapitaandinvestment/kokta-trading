import { useState } from 'react';
import clsx from 'clsx';
import { Percent, Layers, Scale, Ruler, Target, DollarSign, TrendingUp, TrendingDown, Landmark } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
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
        description="Precision math for risk, sizing, and growth — because guessing is not a strategy."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="p-2 lg:col-span-1">
          <ul className="space-y-0.5">
            {tools.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setActive(t.id)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active === t.id
                      ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
                      : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  <t.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 lg:col-span-3">
          <h3 className="mb-6 text-sm font-semibold text-ink-900 dark:text-ink-50">{activeLabel}</h3>
          {ActiveTool ? <ActiveTool /> : null}
        </Card>
      </div>
    </div>
  );
}

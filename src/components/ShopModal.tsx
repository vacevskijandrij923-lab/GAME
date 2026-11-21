import React, { useMemo, useRef, useState } from 'react';
import { CAR_CATALOG } from '../game/catalog';
import { getRemainingShopCost, getShopCarCounts } from '../game/physics';
import { CarSpec } from '../game/types';
import { CarPreview } from './CarPreview';

interface ShopModalProps {
  money: number;
  ownedCarIds: string[];
  equippedCarId: string;
  onBuyCar: (carId: string) => void;
  onBuyAll: () => void;
  onEquipCar: (carId: string) => void;
  onClose: () => void;
}

type TierFilter = 'All' | 'Owned' | CarSpec['tier'];
const TIER_FILTERS: TierFilter[] = [
  'All',
  'Owned',
  'Starter',
  'Street',
  'Heavy',
  'Apex',
  'Titan',
];
const PAGE_SIZE = 24;

const MAX_SPEED_CAP = Math.max(...CAR_CATALOG.map((c) => c.maxSpeed));
const MAX_SMASH_CAP = Math.max(...CAR_CATALOG.map((c) => c.smashPower));
const MAX_HP_CAP = Math.max(...CAR_CATALOG.map((c) => c.maxHp));

export const ShopModal: React.FC<ShopModalProps> = ({
  money,
  ownedCarIds,
  equippedCarId,
  onBuyCar,
  onBuyAll,
  onEquipCar,
  onClose,
}) => {
  const [tierFilter, setTierFilter] = useState<TierFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  const { ownedCount, totalCount } = getShopCarCounts(ownedCarIds);
  const { totalCost: buyAllCost, remainingCount } = useMemo(
    () => getRemainingShopCost(ownedCarIds),
    [ownedCarIds]
  );
  const canBuyAll = remainingCount > 0 && money >= buyAllCost;
  const ownedSet = useMemo(() => new Set(ownedCarIds), [ownedCarIds]);

  const filteredCars = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CAR_CATALOG.filter((car) => {
      if (tierFilter === 'Owned' && !ownedSet.has(car.id)) return false;
      if (tierFilter !== 'All' && tierFilter !== 'Owned' && car.tier !== tierFilter) {
        return false;
      }
      if (!q) return true;
      return (
        car.name.toLowerCase().includes(q) ||
        car.tagline.toLowerCase().includes(q) ||
        car.tier.toLowerCase().includes(q) ||
        car.bodyShape.toLowerCase().includes(q)
      );
    });
  }, [tierFilter, searchQuery, ownedSet]);

  const totalPages = Math.max(1, Math.ceil(filteredCars.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pagedCars = useMemo(
    () => filteredCars.slice(startIdx, startIdx + PAGE_SIZE),
    [filteredCars, startIdx]
  );

  const changePage = (nextPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setPage(clamped);
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = 0;
    }
  };

  const handleSelectTier = (tier: TierFilter) => {
    setTierFilter(tier);
    setPage(1);
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = 0;
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = 0;
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#0B0E14]/90"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-modal-title"
    >
      <div className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl bg-[#151B26] border border-slate-700 shadow-2xl overflow-hidden">
        {/* Shop Header with explicit Car Counter & Cash Balance */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[#10151E] border-b border-slate-700/80">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2
              id="shop-modal-title"
              className="font-display text-3xl font-extrabold uppercase tracking-wide text-slate-50"
            >
              Car Shop &amp; Garage
            </h2>
            <span
              data-testid="shop-car-counter"
              className="text-sm font-semibold text-amber-400 font-mono-tabular"
            >
              Cars Owned: {ownedCount.toLocaleString()} / {totalCount.toLocaleString()} ·{' '}
              {totalCount.toLocaleString()} Cars in Shop
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#182230] border border-emerald-500/60">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Cash
              </span>
              <span className="font-mono-tabular text-xl font-bold text-emerald-400">
                ${money.toLocaleString()}
              </span>
            </div>

            {remainingCount === 0 ? (
              <button
                type="button"
                disabled
                data-testid="shop-buy-all-btn"
                className="px-3.5 py-2 rounded-lg bg-amber-400/20 border border-amber-400 text-amber-300 text-xs sm:text-sm font-bold uppercase tracking-wide whitespace-nowrap cursor-default"
              >
                All {totalCount.toLocaleString()} Owned
              </button>
            ) : (
              <button
                type="button"
                disabled={!canBuyAll}
                onClick={onBuyAll}
                data-testid="shop-buy-all-btn"
                title={
                  canBuyAll
                    ? `Buy all ${remainingCount.toLocaleString()} remaining cars for $${buyAllCost.toLocaleString()}`
                    : `Need $${(buyAllCost - money).toLocaleString()} more to buy all ${remainingCount.toLocaleString()} cars`
                }
                className={`px-3.5 py-2 rounded-lg font-bold text-xs sm:text-sm uppercase tracking-wide whitespace-nowrap transition-colors ${
                  canBuyAll
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_2px_0_#065F46] cursor-pointer'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                }`}
              >
                Buy All (${buyAllCost.toLocaleString()})
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold border border-slate-600 cursor-pointer whitespace-nowrap"
            >
              Back to Road [Esc]
            </button>
          </div>
        </div>

        {/* Tier Filter Bar + Search Input */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-[#121822] border-b border-slate-800">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter cars by tier"
          >
            {TIER_FILTERS.map((tier) => {
              const count =
                tier === 'All'
                  ? CAR_CATALOG.length
                  : tier === 'Owned'
                  ? ownedCount
                  : CAR_CATALOG.filter((c) => c.tier === tier).length;
              const active = tierFilter === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectTier(tier)}
                  className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#FACC15] text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {tier} ({count.toLocaleString()})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search 1,000 cars..."
              aria-label="Search cars"
              data-testid="shop-search-input"
              className="w-full sm:w-64 px-3 py-1.5 rounded-lg bg-[#0E131C] border border-slate-700 focus:border-amber-400 focus:outline-none text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Vehicle Grid */}
        <div ref={gridScrollRef} className="flex-1 overflow-y-auto p-5 sm:p-6">
          {pagedCars.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg font-bold text-slate-300">
                No cars match &ldquo;{searchQuery}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTierFilter('All');
                  setPage(1);
                }}
                className="mt-3 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-sm font-semibold border border-slate-600 cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedCars.map((car) => {
                const isOwned = ownedSet.has(car.id);
                const isEquipped = equippedCarId === car.id;
                const canAfford = money >= car.price;

                const speedPct = Math.min(100, Math.round((car.maxSpeed / MAX_SPEED_CAP) * 100));
                const smashPct = Math.min(100, Math.round((car.smashPower / MAX_SMASH_CAP) * 100));
                const armorPct = Math.min(100, Math.round((car.maxHp / MAX_HP_CAP) * 100));

                return (
                  <div
                    key={car.id}
                    data-testid={`shop-car-${car.id}`}
                    className={`flex flex-col justify-between p-4 rounded-xl border transition-colors ${
                      isEquipped
                        ? 'bg-[#1D2738] border-amber-400'
                        : 'bg-[#19202D] border-slate-700/80 hover:border-slate-500'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <CarPreview car={car} />
                        <div className="flex flex-col items-end text-right">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            {car.tier} · x{car.cashMultiplier.toFixed(2)} Cash
                          </span>
                          <span className="font-mono-tabular text-lg font-bold text-emerald-400 mt-0.5">
                            {car.price === 0 ? 'FREE' : `$${car.price.toLocaleString()}`}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-display text-2xl font-bold text-slate-50 tracking-wide">
                        {car.name}
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed mt-1 mb-3 min-h-[32px]">
                        {car.tagline}
                      </p>

                      {/* Stat Bars */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-12 text-slate-400 font-semibold">Speed</span>
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-sky-400" style={{ width: `${speedPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-12 text-slate-400 font-semibold">Smash</span>
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-amber-400" style={{ width: `${smashPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-12 text-slate-400 font-semibold">Armor</span>
                          <div className="flex-1 h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                            <div className="h-full bg-emerald-400" style={{ width: `${armorPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    {isEquipped ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-2.5 rounded-lg bg-amber-400/20 border border-amber-400 text-amber-300 font-bold text-sm tracking-wide cursor-default"
                      >
                        Equipped
                      </button>
                    ) : isOwned ? (
                      <button
                        type="button"
                        onClick={() => onEquipCar(car.id)}
                        className="w-full py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm tracking-wide cursor-pointer transition-colors"
                      >
                        Equip Car
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyCar(car.id)}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm tracking-wide transition-colors ${
                          canAfford
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                            : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        }`}
                      >
                        {canAfford
                          ? `Buy for $${car.price.toLocaleString()}`
                          : `Need $${(car.price - money).toLocaleString()} more`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-[#10151E] border-t border-slate-700/80 text-xs font-semibold text-slate-300">
          <span className="font-mono-tabular">
            Showing {filteredCars.length === 0 ? 0 : startIdx + 1}&ndash;
            {Math.min(startIdx + PAGE_SIZE, filteredCars.length)} of{' '}
            {filteredCars.length.toLocaleString()} vehicles
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => changePage(1)}
              className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 cursor-pointer"
            >
              First
            </button>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => changePage(currentPage - 1)}
              data-testid="shop-prev-page"
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 cursor-pointer"
            >
              Prev
            </button>
            <span
              data-testid="shop-page-indicator"
              className="px-2.5 font-mono-tabular text-amber-300 font-bold"
            >
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(currentPage + 1)}
              data-testid="shop-next-page"
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 cursor-pointer"
            >
              Next
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => changePage(totalPages)}
              className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 cursor-pointer"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { clampAdminMoney } from '../game/physics';

interface AdminPanelModalProps {
  money: number;
  ownedCars: number;
  totalCars: number;
  isVerified: boolean;
  hasCustomPin: boolean;
  onVerifyPassphrase: (passphrase: string) => boolean;
  onLockAdmin: () => void;
  onUpdateCustomPin: (newPin: string) => void;
  onSetMoney: (amount: number) => void;
  onAddMoney: (delta: number) => void;
  onRepairArmor: () => void;
  onClearWanted: () => void;
  onUnlockAllCars: () => void;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  money,
  ownedCars,
  totalCars,
  isVerified,
  hasCustomPin,
  onVerifyPassphrase,
  onLockAdmin,
  onUpdateCustomPin,
  onSetMoney,
  onAddMoney,
  onRepairArmor,
  onClearWanted,
  onUnlockAllCars,
  onClose,
}) => {
  const [passInput, setPassInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [moneyInput, setMoneyInput] = useState(String(money));
  const [pinInput, setPinInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setMoneyInput(String(money));
  }, [money]);

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onVerifyPassphrase(passInput);
    if (!ok) {
      setAuthError('Access denied. Owner key required.');
      return;
    }
    setAuthError(null);
    setPassInput('');
    setStatusMsg('Owner verified.');
  };

  const handleSetMoneySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(moneyInput.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(parsed)) {
      setStatusMsg('Enter a valid number.');
      return;
    }
    const clamped = clampAdminMoney(parsed);
    onSetMoney(clamped);
    setMoneyInput(String(clamped));
    setStatusMsg(`Cash set to $${clamped.toLocaleString()}`);
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pinInput.trim();
    if (trimmed.length < 3) {
      setStatusMsg('PIN must be at least 3 characters.');
      return;
    }
    onUpdateCustomPin(trimmed);
    setPinInput('');
    setStatusMsg('Custom owner PIN saved.');
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0B0E14]/86"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      data-testid="admin-modal"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#151B26] border border-amber-500/60 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <span className="inline-block px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-1.5">
              Owner Only
            </span>
            <h2
              id="admin-modal-title"
              className="font-display text-3xl font-extrabold uppercase tracking-wide text-slate-50 leading-none"
            >
              Admin Panel
            </h2>
          </div>

          <button
            type="button"
            data-testid="admin-close-btn"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-600 cursor-pointer"
          >
            Close [Esc]
          </button>
        </div>

        {!isVerified ? (
          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              This panel is restricted to the game owner. Enter your owner key to unlock cash &amp; world controls.
            </p>
            <div>
              <label
                htmlFor="owner-passphrase"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Owner Key
              </label>
              <input
                id="owner-passphrase"
                data-testid="admin-passphrase-input"
                type="password"
                value={passInput}
                onChange={(e) => {
                  setPassInput(e.target.value);
                  setAuthError(null);
                }}
                placeholder="Enter owner key"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0F131C] border border-slate-600 focus:border-amber-400 focus:outline-none text-slate-100 text-sm"
              />
            </div>

            {authError && (
              <div
                data-testid="admin-auth-error"
                className="px-3 py-2 rounded-lg bg-red-950/80 border border-red-500/60 text-red-200 text-xs font-semibold"
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              data-testid="admin-unlock-btn"
              className="w-full py-2.5 rounded-lg bg-[#FACC15] hover:bg-[#FDE047] text-slate-950 font-display text-lg font-extrabold uppercase tracking-wide cursor-pointer"
            >
              Unlock Owner Panel
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            {/* Current Bank Balance */}
            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#0F131C] border border-emerald-500/50">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Current Bank Cash
                </div>
                <div
                  data-testid="admin-current-money"
                  className="font-mono-tabular text-2xl font-bold text-emerald-400"
                >
                  ${money.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Garage
                </div>
                <div className="font-mono-tabular text-sm font-bold text-slate-200">
                  {ownedCars} / {totalCars}
                </div>
              </div>
            </div>

            {/* Exact Cash Editor */}
            <form onSubmit={handleSetMoneySubmit} className="space-y-2">
              <label
                htmlFor="admin-money-field"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400"
              >
                Set Exact Cash Amount
              </label>
              <div className="flex gap-2">
                <input
                  id="admin-money-field"
                  data-testid="admin-money-input"
                  type="number"
                  min={0}
                  max={999999999999}
                  step={1}
                  value={moneyInput}
                  onChange={(e) => setMoneyInput(e.target.value)}
                  className="flex-1 px-3.5 py-2 rounded-lg bg-[#0F131C] border border-slate-600 focus:border-emerald-400 focus:outline-none font-mono-tabular text-emerald-300 text-base font-bold"
                />
                <button
                  type="submit"
                  data-testid="admin-set-money-btn"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm cursor-pointer whitespace-nowrap"
                >
                  Set Cash
                </button>
              </div>
            </form>

            {/* Quick Cash Buttons */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Quick Cash Presets
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <button
                  type="button"
                  data-testid="admin-add-10k"
                  onClick={() => {
                    onAddMoney(10000);
                    setStatusMsg('Added $10,000');
                  }}
                  className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 font-mono-tabular font-bold text-xs cursor-pointer"
                >
                  +$10K
                </button>
                <button
                  type="button"
                  data-testid="admin-add-1m"
                  onClick={() => {
                    onAddMoney(1000000);
                    setStatusMsg('Added $1,000,000');
                  }}
                  className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 font-mono-tabular font-bold text-xs cursor-pointer"
                >
                  +$1M
                </button>
                <button
                  type="button"
                  data-testid="admin-add-100m"
                  onClick={() => {
                    onAddMoney(100000000);
                    setStatusMsg('Added $100,000,000');
                  }}
                  className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-emerald-300 font-mono-tabular font-bold text-xs cursor-pointer"
                >
                  +$100M
                </button>
                <button
                  type="button"
                  data-testid="admin-max-cash"
                  onClick={() => {
                    onSetMoney(999999999);
                    setStatusMsg('Cash maxed to $999,999,999');
                  }}
                  className="py-2 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-300 font-mono-tabular font-bold text-xs cursor-pointer"
                >
                  MAX $
                </button>
                <button
                  type="button"
                  data-testid="admin-reset-cash"
                  onClick={() => {
                    onSetMoney(0);
                    setStatusMsg('Cash reset to $0');
                  }}
                  className="py-2 px-2 rounded-lg bg-slate-800 hover:bg-red-900/60 border border-slate-600 text-slate-300 font-mono-tabular font-bold text-xs cursor-pointer"
                >
                  $0
                </button>
              </div>
            </div>

            {/* Gameplay Admin Tools */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Owner Tools
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  data-testid="admin-repair-btn"
                  onClick={() => {
                    onRepairArmor();
                    setStatusMsg('Armor repaired to 100%.');
                  }}
                  className="py-2 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 font-semibold text-xs cursor-pointer"
                >
                  Repair Armor
                </button>
                <button
                  type="button"
                  data-testid="admin-clear-wanted-btn"
                  onClick={() => {
                    onClearWanted();
                    setStatusMsg('Wanted stars cleared.');
                  }}
                  className="py-2 px-3 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 font-semibold text-xs cursor-pointer"
                >
                  Clear Police
                </button>
                <button
                  type="button"
                  data-testid="admin-unlock-cars-btn"
                  onClick={() => {
                    onUnlockAllCars();
                    setStatusMsg(`Unlocked all ${totalCars} cars.`);
                  }}
                  className="py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 font-semibold text-xs cursor-pointer"
                >
                  Unlock All Cars
                </button>
              </div>
            </div>

            {/* Custom PIN + Lock */}
            <form
              onSubmit={handleSavePin}
              className="pt-3 border-t border-slate-700/80 flex flex-wrap items-center gap-2"
            >
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={hasCustomPin ? 'Update custom PIN...' : 'Set custom PIN (optional)'}
                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-[#0F131C] border border-slate-600 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                Save PIN
              </button>
              <button
                type="button"
                data-testid="admin-lock-btn"
                onClick={onLockAdmin}
                className="px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-600/60 text-xs font-semibold text-red-200 cursor-pointer"
              >
                Lock Panel
              </button>
            </form>

            {statusMsg && (
              <div
                data-testid="admin-status-msg"
                className="text-xs font-semibold text-emerald-300"
              >
                {statusMsg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

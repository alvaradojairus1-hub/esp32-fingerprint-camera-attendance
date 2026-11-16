import React, { useEffect, useState } from 'react';
import { firebaseService } from '../../services/firebaseService';

export default function PayrollSettings() {
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weekValue, setWeekValue] = useState('');
  const [recurrenceDays, setRecurrenceDays] = useState([]); // for monthly/semimonthly
  const [payrollDay, setPayrollDay] = useState('monday'); // for weekly frequency (monday..sunday)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await firebaseService.getPayrollConfig();
        if (!mounted) return;
        if (cfg) {
          setFrequency(cfg.frequency || 'monthly');
          setStartDate(cfg.range?.start || '');
          setEndDate(cfg.range?.end || '');
            setWeekValue(cfg.week || '');
            // support legacy or new field for weekly payroll day
            setPayrollDay(cfg.week || cfg.payrollDay || 'monday');
          if (cfg.recurrence && Array.isArray(cfg.recurrence.days)) setRecurrenceDays(cfg.recurrence.days.slice(0,2));
        }
      } catch (e) {
        console.error('Failed to load payroll config', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { frequency: frequency, updatedAt: new Date().toISOString() };
      if (frequency === 'weekly') {
        // For weekly frequency we persist the weekday (monday..sunday)
        payload.week = payrollDay || null;
      } else {
        const days = Array.isArray(recurrenceDays) ? recurrenceDays.map(d => Number(d)).filter(Boolean) : [];
        if (frequency === 'monthly' && days.length !== 1) {
          alert('Please provide a single day for monthly payroll');
          setSaving(false);
          return;
        }
        if (frequency === 'semimonthly' && days.length !== 2) {
          alert('Please provide two different days for semimonthly payroll');
          setSaving(false);
          return;
        }
        payload.recurrence = { type: frequency === 'monthly' ? 'monthly' : 'semimonthly', days };
      }

      await firebaseService.savePayrollConfig(payload);
      alert('Payroll settings saved');
    } catch (e) {
      console.error('Failed to save payroll config', e);
      alert('Failed to save payroll settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Payroll Schedule</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="px-3 py-2 border rounded-md w-56"
          >
            <option value="monthly">Monthly</option>
            <option value="semimonthly">Twice a month (Semi-monthly)</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {frequency !== 'weekly' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recurring day(s) of month</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="31" value={recurrenceDays[0] || ''} onChange={e => setRecurrenceDays([Number(e.target.value) || 0, recurrenceDays[1] || null].filter(Boolean))} className="px-3 py-2 border rounded-md w-32" />
              {frequency === 'semimonthly' && (
                <input type="number" min="1" max="31" value={recurrenceDays[1] || ''} onChange={e => setRecurrenceDays([recurrenceDays[0] || null, Number(e.target.value) || 0].filter(Boolean))} className="px-3 py-2 border rounded-md w-32" />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">These day(s) will repeat every month until changed. For example 12 → 12th of each month.</p>
          </div>
        ) : null}

        {/* Weekly: select payroll weekday instead of date range */}
        {frequency === 'weekly' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payroll Weekday</label>
            <select value={payrollDay} onChange={e => setPayrollDay(e.target.value)} className="px-3 py-2 border rounded-md w-56">
              <option value="monday">Monday</option>
              <option value="tuesday">Tuesday</option>
              <option value="wednesday">Wednesday</option>
              <option value="thursday">Thursday</option>
              <option value="friday">Friday</option>
              <option value="saturday">Saturday</option>
              <option value="sunday">Sunday</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Choose the weekday payroll will run for weekly frequency (e.g., Monday).</p>
          </div>
        ) : null}

        <div className="pt-4">
          <button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-md">
            {saving ? 'Saving...' : 'Save Payroll Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

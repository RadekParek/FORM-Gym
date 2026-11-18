import { useState } from 'react';
import type { AppData } from '../model';
import { isPremium } from '../engine';
import { useT } from '../i18n';
import { LOCALES } from '../ui';

export default function PremiumPage({ data }: { data: AppData }) {
  const t = useT(data.settings.language);
  const active = isPremium(data);
  const [billing, setBilling] = useState<'monthly' | 'lifetime'>('lifetime');
  return (
    <section className="page premium-page">
      <header className="page-heading">
        <h1>{t('premium')}</h1>
      </header>
      {active && (
        <p className="premium-status">
          {data.premium.lifetime
            ? t('activeLifetime')
            : t('subscribedUntil', {
                date: new Date(data.premium.until!).toLocaleDateString(
                  LOCALES[data.settings.language],
                ),
              })}
        </p>
      )}
      <p className="muted">{t('premiumDetails')}</p>
      <section className="section-block premium-feature-section">
        <ul className="plain-list premium-feature-list">
          {[1, 2, 3, 4].map((index) => (
            <li key={index}>{t(`premiumFeature${index}`)}</li>
          ))}
          <li>{t('shareSession')}</li>
        </ul>
      </section>
      <section className="section-block premium-plan-section">
        <h2>{t('choosePlan')}</h2>
        <fieldset className="pricing-options">
          <legend className="sr-only">{t('billingPlan')}</legend>
          <label className={`pricing-option ${billing === 'monthly' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="billing-plan"
              value="monthly"
              checked={billing === 'monthly'}
              onChange={() => setBilling('monthly')}
            />
            <span>
              <strong>{t('monthly')}</strong>
              <small>{t('monthlyPriceHelp')}</small>
            </span>
            <strong>€4.99</strong>
          </label>
          <label className={`pricing-option ${billing === 'lifetime' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="billing-plan"
              value="lifetime"
              checked={billing === 'lifetime'}
              onChange={() => setBilling('lifetime')}
            />
            <span>
              <strong>{t('lifetime')}</strong>
              <small>{t('lifetimePriceHelp')}</small>
            </span>
            <strong>€49.99</strong>
          </label>
        </fieldset>
        <button className="button primary" disabled>
          {t('checkoutUnavailable')}
        </button>
        <p className="fine-print">{t('premiumUnavailable')}</p>
      </section>
    </section>
  );
}

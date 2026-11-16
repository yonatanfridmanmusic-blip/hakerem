-- 2.9.0: תכנון פעילויות במסך ההורים - פירוט רכיבי העלות של פעילות.
-- אדיטיבי בלבד. שורה קיימת (תת-קטגוריה מ-2.8.0) מקבלת [] ונשארת בלי תכנון.
alter table public.budget_activities add column if not exists components jsonb not null default '[]'::jsonb;
comment on column public.budget_activities.components is '2.9.0: cost components of a planned activity - [{name, kind: per_student|quantity|fixed, price, qty?}]. Empty = one lump amount in planned_amount.';

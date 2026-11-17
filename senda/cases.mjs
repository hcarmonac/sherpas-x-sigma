import { readFileSync } from 'node:fs';

const dollars = new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'USD', currencyDisplay: 'code', useGrouping: 'always',
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const percent = new Intl.NumberFormat('es-ES', { style: 'percent' });

function findScenario(score, ...titles) {
  const group = titles.length === 1 ? 'top_moves' : 'combined_moves';
  const index = score[group].findIndex((record) => {
    const moves = record.moves ?? [record.title];
    return moves.length === titles.length && titles.every((title) => moves.includes(title));
  });
  if (index < 0) throw new Error(`Falta el escenario de Sherpas: ${titles.join(', ')}`);
  return { record: score[group][index], source: `score.${group}[${index}]` };
}

function buildWeah(plan) {
  const cardTitle = 'Pay down revolving card';
  const lifeTitle = 'Add life cover';
  const umbrellaTitle = 'Add umbrella cover';
  const card = findScenario(plan.score, cardTitle);
  const cardAndLife = findScenario(plan.score, cardTitle, lifeTitle);
  const full = findScenario(plan.score, cardTitle, lifeTitle, umbrellaTitle);
  const umbrella = findScenario(plan.score, umbrellaTitle);

  const creditCard = plan.profile.liabilities.find((item) => item.type === 'PERSONAL_CREDIT_CARD');
  const balance = dollars.format(creditCard.balance);
  const rate = percent.format(creditCard.interest_rate);
  const cash = dollars.format(plan.key_metrics.facts.cash.cashAboveTotalNeeded.value);
  const paymentAmount = creditCard.balance - card.record.target_amount;
  const payment = dollars.format(paymentAmount);
  const remainingBalance = dollars.format(card.record.target_amount);
  const monthlyRate = creditCard.interest_rate / 12;
  const monthlyInterestSaved = dollars.format(paymentAmount * monthlyRate);
  const monthlyInterest = [creditCard.balance, card.record.target_amount]
    .map((amount) => dollars.format(amount * monthlyRate));
  const lifeInForce = plan.profile.insurance.filter(({ type }) => type === 'WHOLE_LIFE')
    .reduce((total, { coverage }) => total + coverage, 0);
  const coverage = dollars.format(umbrella.record.target_amount);
  const lifeThreshold = cardAndLife.record.note.match(/\$([\d,]+)/)?.[1];
  const totalLifeCoverage = lifeThreshold
    ? `Elevar el seguro de vida total a ${dollars.format(Number(lifeThreshold.replaceAll(',', '')))}.`
    : 'Elevar el seguro de vida al umbral indicado en el plan.';
  const house = plan.goals.chartGoals.find((goal) => goal.subType === 'REAL_ESTATE_PURCHASE');
  const houseYear = house.date.slice(0, 4);

  const cardCondition = `Abonar ${payment} a la tarjeta con efectivo. Quedarían ${remainingBalance} pendientes.`;
  return {
    title: 'Timothy y Melanie Weah',
    planUrl: 'https://app.sherpaswealth.com/plan/shared/RcCtgoNkGmD6dvGtYVKWLGefdCTFdc4JP_jH9Jbz2jo',
    question: '¿Qué podéis revisar antes de usar vuestro efectivo?',
    introduction: `Tenéis ${balance} en una tarjeta al ${rate}. También queréis proteger a vuestra familia. Empezad por lo que cada uno necesita aclarar.`,
    fact: {
      value: cash,
      label: 'Por encima del colchón y de los objetivos cercanos incluidos en el plan',
    },
    concerns: [
      {
        id: 'cash', label: 'Cuánto efectivo nos conviene reservar',
        fact: `${balance} al ${rate} anual`,
        why: `Mientras mantengáis ese saldo, pagáis intereses por la tarjeta. Si primero reserváis lo necesario para facturas e imprevistos, podréis valorar el abono de ${payment} sin perder de vista esos gastos.`,
      },
      {
        id: 'cover', label: 'Qué cubren nuestras pólizas',
        fact: `${dollars.format(lifeInForce)} de cobertura en el plan`,
        why: 'Si uno de vosotros fallece, el seguro de vida puede ayudar a cubrir los gastos de la familia. Revisad cuánto recibiríais y cuánto tiempo podría cubrir esos gastos.',
      },
    ],
    defaultAction: 'prepare-review',
    choices: { cash: 'review-reserve', cover: 'review-policies' },
    actions: [
      {
        id: 'prepare-review',
        label: 'Poner las dudas en común',
        title: 'Acordar la pregunta que queréis resolver juntos',
        description: 'Contad qué necesita aclarar cada uno. Escribid una pregunta para el asesor que conecte el efectivo que queréis reservar con lo que necesitáis proteger.',
        win: 'Ya tenéis una pregunta compartida para el asesor.',
        impact: {
          value: `${plan.score.published_score} → ${cardAndLife.record.score_after}`,
          label: 'Puntos de salud financiera en el escenario conjunto',
          note: `La puntuación estimada por Sherpas requiere abonar ${payment} y elevar la cobertura de vida al umbral del escenario.`,
          source: cardAndLife.source,
        },
        source: 'narrative.summary_recommendations',
      },
      {
        id: 'review-reserve',
        label: 'Reservar el colchón',
        title: 'Comprobar qué efectivo necesitáis reservar',
        description: 'Revisad las facturas próximas y confirmad qué objetivos debe cubrir el efectivo antes de valorar un pago de la tarjeta.',
        win: 'Ya sabéis qué gastos debe cubrir vuestro efectivo.',
        impact: {
          value: cash,
          label: 'Por encima de la reserva y los objetivos cercanos',
          note: 'Ese es el margen que calcula el plan. Confirmad los gastos que queréis cubrir antes de destinar efectivo a la deuda.',
        },
        source: 'key_metrics.facts.cash.cashAboveTotalNeeded',
      },
      {
        id: 'review-policies',
        label: 'Revisar la protección',
        title: 'Revisar las dos pólizas de vida',
        description: 'Localizad ambas pólizas y comprobad qué importe cubre cada una. Llevad cualquier duda al asesor.',
        win: 'Ya podéis hablar de vuestras pólizas con los importes a mano.',
        impact: {
          value: dollars.format(lifeInForce),
          label: 'Cobertura de vida que figura en el plan',
          note: 'Contrastad ese importe con las pólizas vigentes para saber qué cobertura tendríais que complementar.',
          source: 'profile.insurance',
        },
        source: 'narrative.protection_life_insurance_short_observations',
      },
      {
        id: 'record-card-payment',
        label: 'Reducir la deuda',
        title: 'Registrar el abono previsto en la tarjeta',
        description: `Simulad el abono de ${payment} del escenario de Sherpas. La tarjeta pasaría de ${balance} a ${remainingBalance}.`,
        completeLabel: 'Registrar abono de ejemplo',
        win: 'Un saldo menor deja más dinero disponible al reducir el coste de los intereses.',
        impact: {
          value: `≈ ${monthlyInterestSaved}`,
          label: 'Menos en intereses el primer mes',
          note: `Estimación si abonáis ${payment} antes del mes y se mantiene el ${rate} anual. Calculado como saldo × tipo anual ÷ 12, sin nuevas compras ni comisiones.`,
          comparison: monthlyInterest,
        },
        source: card.source,
      },
    ],
    later: [
      { when: 'En un año', text: 'Revisar cuánto podéis destinar a protección y a los estudios.' },
      { when: 'En los próximos cinco años', text: `Volver a revisar el objetivo de vivienda de ${houseYear} y cuánto efectivo reservar.` },
    ],
    scenarios: [
      {
        id: 'card', title: 'Rebajar la tarjeta', score: card.record.score_after, source: card.source,
        summary: 'El pago reduce la deuda y utiliza parte del efectivo disponible.',
        conditions: [cardCondition],
      },
      {
        id: 'card-life', title: 'Tarjeta y seguro de vida', score: cardAndLife.record.score_after, source: cardAndLife.source,
        summary: 'El resultado combina una deuda menor con más protección de vida.',
        conditions: [cardCondition, totalLifeCoverage],
      },
      {
        id: 'card-life-umbrella', title: 'Añadir protección adicional', score: full.record.score_after, source: full.source,
        summary: 'El tercer escenario añade una póliza de responsabilidad civil adicional.',
        conditions: [cardCondition, totalLifeCoverage, `Añadir una cobertura de responsabilidad civil adicional de ${coverage}.`],
      },
    ],
    explanation: 'Son puntuaciones condicionadas a cada combinación de Sherpas. Confirmad el coste de las pólizas y el efectivo a reservar antes de decidir.',
    questions: [
      { question: '¿Por qué cambia la puntuación?', answer: 'La tarjeta y la cobertura de vida afectan al índice de Sherpas. Cada combinación aplica las condiciones que se ven en la ficha.', source: 'score.combined_moves' },
      { question: '¿Cuánto quedaría en la tarjeta?', answer: `El escenario que abona ${payment} deja un saldo de ${remainingBalance}.`, source: card.source },
    ],
  };
}

function buildSamantha(plan) {
  const depletion = plan.key_metrics.retirementAndOtherGoals.assetDepletion;
  const age = depletion.ageWhenTheyRunOutOfLiquidAssets;
  const home = findScenario(plan.score, 'Close a coverage gap');
  const concentration = findScenario(plan.score, 'Reduce single-name concentration');
  const growth = findScenario(plan.score, 'Reduce growth allocation toward glide');
  const house = plan.goals.chartGoals.find((goal) => goal.subType === 'REAL_ESTATE_PURCHASE');
  const finances = plan.key_metrics.facts;
  const ethanCost = finances.education.annualCostPerGoal.find(({ label }) => label.includes('Ethan')).value;
  const retirementShare = finances.retirement.incomeShareOfNeed.value.replace('%', ' %');

  return {
    title: 'Samantha Lewis',
    planUrl: 'https://app.sherpaswealth.com/plan/shared/vyV2h64-qSet-sJuwkAHxw-iUaYV88Lkwsg29L2Y5y8',
    question: `¿Qué significa tener un ${plan.score.published_score}/100 si tus ahorros se agotan a los ${age}?`,
    introduction: 'Tu protección y tu ausencia de deuda ayudan a la puntuación. La jubilación merece su propia revisión.',
    fact: { value: `${age} años`, label: 'Edad a la que se agotan tus ahorros e inversiones en la proyección actual' },
    concerns: [
      {
        id: 'retirement', label: 'Qué opciones tengo para la jubilación',
        fact: `${retirementShare} del gasto cubierto por ingresos garantizados`,
        why: 'La proyección cuenta con tus ahorros para cubrir el resto. Preguntar si tu empresa ofrece un plan te dice si tienes otra vía de ahorro para la jubilación.',
      },
      {
        id: 'college', label: 'Cómo preparar el siguiente pago de estudios',
        fact: `${dollars.format(ethanCost)} al año para los estudios de Ethan`,
        why: 'Ese pago y tu reserva para imprevistos salen del mismo efectivo. Confirmar el importe y la fecha te ayuda a separarlo antes de decidir cuánto destinar a la jubilación.',
      },
    ],
    defaultAction: 'check-employer',
    choices: { retirement: 'check-employer', college: 'check-college-payment' },
    actions: [
      {
        id: 'check-employer', label: 'Explorar tu jubilación', title: 'Confirmar si tu empresa ofrece un plan de jubilación',
        description: 'Consulta a recursos humanos qué plan ofrecen y qué opciones tienes para aportar.',
        win: 'Ya sabes con qué opciones de jubilación puedes contar en tu empresa.',
        impact: {
          value: retirementShare,
          label: 'Del gasto de jubilación cubierto por los ingresos garantizados',
          note: 'El plan deja por confirmar si tu empresa ofrece una cuenta de jubilación.',
          source: 'key_metrics.facts.retirement.incomeShareOfNeed',
        },
        source: 'narrative.summary_recommendations',
      },
      {
        id: 'check-college-payment', label: 'Preparar los estudios', title: 'Confirmar el siguiente pago de estudios',
        description: 'Comprueba el importe y la fecha del próximo pago de Ethan y revisa qué efectivo tienes reservado para ello.',
        win: 'Ya tienes identificado el pago y el efectivo reservado para los estudios.',
        impact: {
          value: dollars.format(ethanCost),
          label: 'Coste anual previsto para los estudios de Ethan',
          note: 'Comprueba el siguiente pago y el efectivo disponible por encima de tu reserva.',
          source: 'key_metrics.facts.education.annualCostPerGoal',
        },
        source: 'narrative.summary_recommendations',
      },
    ],
    later: [
      { when: 'En un año', text: 'Revisar cómo comparten el presupuesto los estudios y la jubilación.' },
      { when: 'En los próximos cinco años', text: `Volver a revisar el objetivo de compra de vivienda de ${house.date.slice(0, 4)}.` },
    ],
    scenarios: [
      {
        id: 'home', title: 'Revisar la cobertura de vivienda', score: home.record.score_after, source: home.source,
        summary: 'El escenario aplica la cobertura de hogar. Comprueba primero qué póliza está en vigor.',
        conditions: ['El cálculo de Sherpas incorpora un seguro de vivienda a la propiedad principal.'],
      },
      {
        id: 'concentration', title: 'Reducir la concentración', score: concentration.record.score_after, source: concentration.source,
        summary: 'El escenario reduce el peso de la posición más grande del ejemplo.',
        conditions: ['La simulación de Sherpas reduce el peso de VTI en la cartera invertible del 39 % al 25 %.'],
      },
      {
        id: 'growth', title: 'Ajustar el peso de crecimiento', score: growth.record.score_after, source: growth.source,
        summary: 'El escenario ajusta la proporción invertida en activos de crecimiento.',
        conditions: ['La simulación de Sherpas reduce el peso de estos activos del 85 % al 80 %.'],
      },
    ],
    explanation: `Los escenarios comparan el índice de salud financiera. La estimación de ${age} años corresponde al plan actual.`,
    questions: [
      { question: '¿Por qué pueden ser altas la puntuación y la preocupación por la jubilación?', answer: 'El índice reúne varias áreas como protección, deuda y liquidez. La proyección de jubilación se centra en cuánto duran los ahorros.', source: 'narrative.summary_main' },
      { question: '¿Qué conviene confirmar en el trabajo?', answer: 'El plan señala que falta confirmar si tienes un plan de jubilación disponible a través de tu empresa.', source: 'narrative.summary_recommendations' },
    ],
  };
}

const caseBuilders = {
  'timothy-melanie-weah': buildWeah,
  'samantha-lewis': buildSamantha,
};

export const cases = Object.entries(caseBuilders).map(([id, build]) => {
  const file = new URL(`../cases/${id}/financial-health.json`, import.meta.url);
  const plan = JSON.parse(readFileSync(file, 'utf8'));
  if (plan.case.synthetic !== true) throw new Error(`Senda solo admite casos sintéticos: ${id}`);
  return {
    id,
    members: plan.case.household.filter((member) => member.role !== 'child')
      .map(({ role, first_name: name }) => ({ id: role, name })),
    score: plan.score.published_score,
    ...build(plan),
  };
});

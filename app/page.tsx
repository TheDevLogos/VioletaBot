const capabilities = [
  {
    title: 'Conversación natural por WhatsApp',
    text:
      'Violeta escucha, conserva el contexto y responde con lenguaje cercano, breve y humano, sin convertir la conversación en un formulario.',
  },
  {
    title: 'Detección temprana de violencia',
    text:
      'Reglas auditables identifican señales de violencia psicológica, económica, social, sexual y física, además de lenguaje de peligro inmediato.',
  },
  {
    title: 'Angustia y desesperación',
    text:
      'El sistema registra señales expresadas de angustia, pánico y desesperanza sin convertirlas en diagnósticos clínicos.',
  },
  {
    title: 'Señales de autolesión',
    text:
      'Violeta reconoce lenguaje explícito o preocupante asociado a autolesión e ideación suicida y prioriza revisión humana y apoyo profesional.',
  },
  {
    title: 'Canalización con consentimiento',
    text:
      'La usuaria decide mediante botones si desea apoyo de una terapeuta. El número y un resumen mínimo solo se comparten cuando existe autorización.',
  },
  {
    title: 'Centro de Operación en vivo',
    text:
      'Operadoras visualizan violencia, estado emocional, alertas, notas, canalizaciones, disponibilidad de terapeutas y seguimiento en una sola pantalla.',
  },
];

const flow = [
  ['1', 'La mujer escribe', 'Inicia una conversación desde WhatsApp, con sus propias palabras.'],
  ['2', 'Violeta escucha', 'Mantiene contexto, responde con naturalidad y evita interrogatorios innecesarios.'],
  ['3', 'Triage preventivo', 'Evalúa en paralelo violencia, angustia y señales de autolesión.'],
  ['4', 'Apoyo humano', 'Cuando corresponde, ofrece operadora o terapeuta y solicita consentimiento.'],
  ['5', 'Canalización', 'El Centro asigna a una profesional disponible de la Red y registra cada paso.'],
  ['6', 'Seguimiento', 'Se documenta contacto, atención, seguimiento y cierre sin crear una historia clínica dentro del bot.'],
];

export default function Home() {
  return (
    <>
      <header className="wrap">
        <nav className="nav">
          <div className="brand">
            VioletaBot
          </div>

          <div className="navlinks">
            <a href="#como-funciona">
              Cómo funciona
            </a>
            <a href="#capacidades">
              Capacidades
            </a>
            <a href="#centro">
              Centro de Operación
            </a>
            <a href="#seguridad">
              Seguridad
            </a>

            <a
              className="btn primary"
              href="/admin/login"
            >
              Acceso institucional
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="wrap heroGrid">
            <div>
              <div className="eyebrow">
                Primer contacto · prevención ·
                atención humana
              </div>

              <h1>
                A veces el primer paso es
                simplemente poder decir:
                <span>
                  {' '}
                  “Necesito hablar con alguien”.
                </span>
              </h1>

              <p>
                VioletaBot convierte WhatsApp en
                una puerta de entrada discreta
                para escuchar, detectar señales
                de violencia y crisis emocional,
                acompañar sin juzgar y conectar a
                la mujer con el apoyo humano
                adecuado.
              </p>

              <div className="actions">
                <a
                  className="btn primary"
                  href="#como-funciona"
                >
                  Conocer el flujo
                </a>

                <a
                  className="btn secondary"
                  href="#seguridad"
                >
                  Modelo de seguridad
                </a>
              </div>

              <div className="heroTrust">
                <span>
                  ✓ WhatsApp como canal
                </span>
                <span>
                  ✓ Supervisión humana
                </span>
                <span>
                  ✓ Consentimiento trazable
                </span>
              </div>
            </div>

            <div className="phone">
              <div className="screen">
                <div className="chathead">
                  <span className="avatar">
                    V
                  </span>
                  <div>
                    <strong>Violeta</strong>
                    <small>
                      apoyo virtual
                    </small>
                  </div>
                </div>

                <div className="bubble user">
                  No sé ni cómo empezar.
                </div>

                <div className="bubble bot">
                  No pasa nada, no tienes que
                  tenerlo ordenado. Puedes
                  empezar por lo que más te esté
                  pesando hoy.
                </div>

                <div className="bubble user">
                  Últimamente ya no puedo con
                  todo. No paro de llorar.
                </div>

                <div className="bubble bot">
                  Suena a que has estado cargando
                  demasiado. Podemos ir una cosa
                  a la vez. Si quieres, también
                  puedo ayudarte a pedir apoyo de
                  una terapeuta disponible.
                </div>

                <div className="chatButtons">
                  <span>
                    Hablar con terapeuta
                  </span>
                  <span>
                    Seguir aquí
                  </span>
                </div>

                <div className="privacyNote">
                  La información de contacto no
                  se comparte con una terapeuta
                  sin autorización.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="section"
        >
          <div className="wrap">
            <div className="eyebrow">
              Del mensaje a la atención humana
            </div>

            <h2>
              Un flujo sencillo para la
              víctima, trazable para la
              institución.
            </h2>

            <p className="lead">
              Violeta no intenta sustituir a una
              terapeuta, abogada, médica u
              operadora. Su valor es estar
              disponible para el primer
              contacto, escuchar con contexto,
              detectar señales y facilitar que
              el apoyo humano llegue antes.
            </p>

            <div className="flowGrid">
              {flow.map(
                ([number, title, text]) => (
                  <article
                    className="flowCard"
                    key={number}
                  >
                    <span>{number}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                )
              )}
            </div>
          </div>
        </section>

        <section
          id="capacidades"
          className="section softBand"
        >
          <div className="wrap">
            <div className="eyebrow">
              Tres señales, una sola visión
            </div>

            <h2>
              Violencia, angustia y autolesión
              no siempre aparecen por separado.
            </h2>

            <p className="lead">
              VioletaBot evalúa estos ejes en
              paralelo. Una mujer puede vivir
              violencia de pareja y al mismo
              tiempo expresar desesperación o
              ideas de hacerse daño. El Centro
              puede coordinar ambas necesidades
              sin perder el contexto.
            </p>

            <div className="signalGrid">
              <article className="signalCard violence">
                <small>
                  Riesgo de violencia
                </small>
                <strong>
                  none → critical
                </strong>
                <p>
                  Amenazas, control coercitivo,
                  violencia física, sexual,
                  encierro y peligro inmediato.
                </p>
              </article>

              <article className="signalCard distress">
                <small>
                  Angustia expresada
                </small>
                <strong>
                  none → severe
                </strong>
                <p>
                  Llanto persistente, pánico,
                  desbordamiento, desesperación
                  y desesperanza.
                </p>
              </article>

              <article className="signalCard selfharm">
                <small>
                  Señales de autolesión
                </small>
                <strong>
                  none → imminent
                </strong>
                <p>
                  Lenguaje preocupante,
                  intención explícita, plan o
                  intento en curso.
                </p>
              </article>
            </div>

            <div className="grid3">
              {capabilities.map(
                (item, index) => (
                  <article
                    className="card"
                    key={item.title}
                  >
                    <div className="icon">
                      {index + 1}
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </article>
                )
              )}
            </div>
          </div>
        </section>

        <section
          id="centro"
          className="section darkBand"
        >
          <div className="wrap centerGrid">
            <div>
              <div className="eyebrow light">
                Centro de Operación
              </div>

              <h2>
                Una vista común para que cada
                acción tenga responsable,
                tiempo y seguimiento.
              </h2>

              <p className="lead lightLead">
                Operadoras pueden priorizar
                expedientes, revisar
                conversaciones, registrar notas,
                asignar responsables, gestionar
                consentimientos, ver
                canalizaciones y coordinar a la
                Red de Terapeutas.
              </p>

              <div className="centerBullets">
                <span>
                  Semáforo de violencia
                </span>
                <span>
                  Angustia / autolesión
                </span>
                <span>
                  Alertas pendientes
                </span>
                <span>
                  Terapeutas disponibles
                </span>
                <span>
                  Bitácora de canalización
                </span>
                <span>
                  Seguimiento y cierre
                </span>
              </div>
            </div>

            <div className="dashboardMock">
              <div className="mockTop">
                <strong>
                  Centro de Operación
                </strong>
                <span>
                  ● EN VIVO
                </span>
              </div>

              <div className="mockStats">
                <div>
                  <small>
                    Casos activos
                  </small>
                  <b>12</b>
                </div>
                <div>
                  <small>
                    Angustia alta
                  </small>
                  <b>3</b>
                </div>
                <div>
                  <small>
                    Canalizaciones
                  </small>
                  <b>2</b>
                </div>
              </div>

              <div className="mockRow">
                <span>
                  WhatsApp ••••3234
                </span>
                <i className="tag orange">
                  high
                </i>
                <i className="tag pink">
                  concern
                </i>
              </div>

              <div className="mockRow">
                <span>
                  WhatsApp ••••0912
                </span>
                <i className="tag red">
                  critical
                </i>
                <i className="tag gray">
                  none
                </i>
              </div>

              <div className="mockReferral">
                <strong>
                  Red de Terapeutas
                </strong>
                <span>
                  2 disponibles · 1 caso en
                  seguimiento
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="pilotCallout">
              <div>
                <div className="eyebrow">
                  Piloto Delicias
                </div>
                <h2>
                  Integración con una Red de
                  Terapeutas disponible 24/7.
                </h2>
                <p className="lead">
                  Para el piloto de Delicias,
                  VioletaBot puede apoyar el
                  primer contacto y permitir que
                  una operadora canalice, con
                  consentimiento, a una terapeuta
                  independiente disponible de la
                  Red, especialmente ante
                  señales de desesperación o
                  ideación suicida.
                </p>
              </div>

              <div className="pilotSteps">
                <div>
                  <strong>1</strong>
                  Violeta ofrece apoyo
                </div>
                <div>
                  <strong>2</strong>
                  La usuaria autoriza
                </div>
                <div>
                  <strong>3</strong>
                  Operadora asigna terapeuta
                </div>
                <div>
                  <strong>4</strong>
                  Terapeuta contacta a la mujer
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="seguridad"
          className="section"
        >
          <div className="wrap">
            <div className="eyebrow">
              Seguridad por diseño
            </div>

            <h2>
              Inteligencia para escuchar mejor;
              reglas y personas para decidir.
            </h2>

            <div className="grid3">
              <article className="card">
                <h3>
                  Reglas determinísticas
                </h3>
                <p>
                  Lenguaje crítico y criterios de
                  riesgo viven en código
                  versionado. La IA semántica
                  ayuda a interpretar matices,
                  pero no puede rebajar un riesgo
                  crítico ni declarar sola una
                  intervención.
                </p>
              </article>

              <article className="card">
                <h3>
                  Consentimiento real
                </h3>
                <p>
                  Compartir teléfono con una
                  terapeuta requiere autorización
                  explícita. El evento queda
                  registrado con fecha y
                  evidencia.
                </p>
              </article>

              <article className="card">
                <h3>
                  Datos mínimos
                </h3>
                <p>
                  El Centro registra coordinación
                  y seguimiento operativo. No
                  pretende convertirse en
                  historia clínica ni almacenar
                  información que no sea
                  necesaria.
                </p>
              </article>
            </div>

            <div className="safetyFoot">
              VioletaBot es una herramienta de
              apoyo preventivo, primer contacto y
              coordinación. No sustituye atención
              psicológica, médica, jurídica ni
              servicios de emergencia. El
              despacho automático a autoridades
              permanece deshabilitado.
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footerInner">
          <div>
            <strong>VioletaBot</strong>
            <div>
              Tecnología pública con enfoque
              humano.
            </div>
          </div>

          <a
            className="btn secondary"
            href="/admin/login"
          >
            Acceso institucional
          </a>
        </div>
      </footer>
    </>
  );
}

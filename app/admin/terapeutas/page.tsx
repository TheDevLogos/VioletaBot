import { AdminNav } from '@/components/admin/AdminNav';
import { requireStaffPage } from '@/lib/auth/staff';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function availabilityClass(status: string) {
  return `opAvailability availability-${status}`;
}

export default async function TherapistsPage() {
  const ctx = await requireStaffPage();
  const db = supabaseAdmin();

  if (!ctx.organizationId) {
    return (
      <main className="opShell">
        <div className="opWrap">
          <AdminNav ctx={ctx} />
          <div className="opPanel">
            Tu perfil no tiene organización.
          </div>
        </div>
      </main>
    );
  }

  const [
    orgResult,
    therapistResult,
  ] = await Promise.all([
    db
      .from('organizations')
      .select('name')
      .eq('id', ctx.organizationId)
      .single(),

    db
      .from('therapists')
      .select('*')
      .eq(
        'organization_id',
        ctx.organizationId
      )
      .order('active', {
        ascending: false,
      })
      .order('full_name'),
  ]);

  const org = orgResult.data;
  const therapists =
    therapistResult.data || [];

  const canManage =
    ctx.role === 'super_admin' ||
    ctx.role === 'admin';

  const canUpdate =
    canManage ||
    ctx.role === 'supervisor';

  const available = therapists.filter(
    (item: any) =>
      item.active &&
      item.availability_status ===
        'available'
  ).length;

  const busy = therapists.filter(
    (item: any) =>
      item.active &&
      item.availability_status ===
        'busy'
  ).length;

  return (
    <main className="opShell">
      <div className="opWrap">
        <AdminNav
          ctx={ctx}
          organizationName={org?.name}
        />

        <div className="opHero">
          <div>
            <h1>Red de Terapeutas</h1>
            <p>
              Directorio operativo y
              disponibilidad de profesionales
              independientes de la Red 24/7.
            </p>
          </div>
        </div>

        <div className="opGrid4">
          <div className="opStat opStatAvailable">
            <small>
              Disponibles ahora
            </small>
            <strong>{available}</strong>
          </div>

          <div className="opStat">
            <small>Ocupadas</small>
            <strong>{busy}</strong>
          </div>

          <div className="opStat">
            <small>
              Activas en la red
            </small>
            <strong>
              {
                therapists.filter(
                  (item: any) =>
                    item.active
                ).length
              }
            </strong>
          </div>

          <div className="opStat">
            <small>
              Total registradas
            </small>
            <strong>
              {therapists.length}
            </strong>
          </div>
        </div>

        {canManage && (
          <div className="opPanel">
            <h2>
              Registrar terapeuta
            </h2>

            <p className="opMuted">
              Registra únicamente datos
              necesarios para coordinación de
              guardias y contacto.
            </p>

            <form
              action="/api/admin/therapists/create"
              method="post"
              className="opFormGrid"
            >
              <div>
                <label className="opLabel">
                  Nombre
                </label>
                <input
                  className="opInput"
                  name="full_name"
                  required
                  maxLength={160}
                />
              </div>

              <div>
                <label className="opLabel">
                  WhatsApp
                </label>
                <input
                  className="opInput"
                  name="whatsapp_number"
                  required
                  placeholder="52639..."
                  maxLength={30}
                />
              </div>

              <div className="full">
                <label className="opLabel">
                  Especialidades / áreas
                </label>
                <input
                  className="opInput"
                  name="specialties"
                  placeholder="prevención suicida, crisis, violencia"
                  maxLength={500}
                />
              </div>

              <div className="full">
                <label className="opLabel">
                  Nota operativa
                </label>
                <textarea
                  className="opTextarea"
                  name="notes"
                  placeholder="Ej. Guardia nocturna, cobertura, observaciones no clínicas."
                  maxLength={2000}
                />
              </div>

              <div>
                <button className="opBtn">
                  Registrar terapeuta
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="opPanel">
          <div className="opSectionTitle">
            <div>
              <h2>
                Disponibilidad actual
              </h2>
              <p className="opMuted">
                Para el piloto la
                disponibilidad se actualiza
                manualmente. No se asigna una
                terapeuta sin confirmación
                humana.
              </p>
            </div>
          </div>

          <div className="opTableWrap">
            <table className="opTable">
              <thead>
                <tr>
                  <th>Terapeuta</th>
                  <th>WhatsApp</th>
                  <th>Áreas</th>
                  <th>Disponibilidad</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {therapists.map(
                  (therapist: any) => (
                    <tr
                      key={therapist.id}
                    >
                      <td>
                        <strong>
                          {therapist.full_name}
                        </strong>
                      </td>

                      <td>
                        ••••
                        {String(
                          therapist.whatsapp_number
                        ).slice(-4)}
                      </td>

                      <td>
                        {(
                          therapist.specialties ||
                          []
                        ).join(', ') ||
                          'Sin especificar'}
                      </td>

                      <td>
                        <span
                          className={availabilityClass(
                            therapist.availability_status
                          )}
                        >
                          {
                            therapist.availability_status
                          }
                        </span>
                      </td>

                      <td>
                        {therapist.active
                          ? 'Activa'
                          : 'Inactiva'}
                      </td>

                      <td>
                        {canUpdate ? (
                          <form
                            action={`/api/admin/therapists/${therapist.id}/availability`}
                            method="post"
                            className="opInlineForm"
                          >
                            <select
                              className="opSelect compact"
                              name="availability_status"
                              defaultValue={
                                therapist.availability_status
                              }
                            >
                              <option value="available">
                                Disponible
                              </option>
                              <option value="busy">
                                Ocupada
                              </option>
                              <option value="off_duty">
                                Fuera de guardia
                              </option>
                            </select>

                            <button className="opBtn secondary compact">
                              Actualizar
                            </button>
                          </form>
                        ) : (
                          <span className="opMuted">
                            Solo lectura
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {!therapists.length && (
              <div className="opEmpty">
                Aún no hay terapeutas
                registradas.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

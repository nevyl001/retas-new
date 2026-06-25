import React from "react";
import { usePageMeta } from "../../hooks/usePageMeta";
import { AppSiteFooter } from "./AppSiteFooter";
import "./privacidad-terminos.css";

const PAGE_TITLE =
  "Aviso de Privacidad y Términos y Condiciones | Riviera Open";
const PAGE_DESCRIPTION =
  "Aviso de Privacidad y Términos y Condiciones de uso de Riviera Open y RivieraApp. Protección de datos personales, finalidades, derechos ARCO y legislación aplicable en México.";

export const PrivacidadTerminosPage: React.FC = () => {
  usePageMeta(PAGE_TITLE, PAGE_DESCRIPTION);

  return (
    <main className="legal-page" id="main-content">
      <article className="legal-page__article">
        <header className="legal-page__header">
          <p className="legal-page__eyebrow">Riviera Open</p>
          <h1 className="legal-page__title">
            Aviso de Privacidad y Términos y Condiciones de Uso
          </h1>
          <p className="legal-page__updated">
            <strong>Última actualización:</strong> Junio de 2026
          </p>
        </header>

        <div className="legal-page__intro">
          <p>
            Bienvenido a <strong>Riviera Open</strong>.
          </p>
          <p>
            Riviera Open es una plataforma deportiva dedicada a la organización de
            torneos, retas, ligas y eventos de pádel, así como al registro de
            resultados, estadísticas, historial deportivo y ranking de jugadores.
          </p>
          <p>
            Al solicitar voluntariamente su registro como jugador, ya sea de manera
            presencial, verbal o por cualquier otro medio autorizado por Riviera
            Open, el usuario manifiesta su consentimiento libre, informado y expreso
            para el tratamiento de sus datos personales conforme al presente Aviso de
            Privacidad y Términos y Condiciones.
          </p>
        </div>

        <section className="legal-page__section" aria-labelledby="legal-s1">
          <h2 id="legal-s1" className="legal-page__heading">
            1. Responsable del tratamiento de los datos personales
          </h2>
          <p>
            Riviera Open, con domicilio en la Ciudad de México, es responsable del
            tratamiento y protección de los datos personales recabados a través de
            RivieraApp, del sitio web y de las plataformas oficiales de Riviera Open.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s2">
          <h2 id="legal-s2" className="legal-page__heading">
            2. Datos personales que podremos recopilar
          </h2>
          <p>Dependiendo del uso de la plataforma podremos solicitar información como:</p>
          <ul className="legal-page__list">
            <li>Nombre completo</li>
            <li>Correo electrónico</li>
            <li>Número telefónico</li>
            <li>Fotografía de perfil (opcional)</li>
            <li>Categoría deportiva</li>
            <li>Club deportivo</li>
            <li>Resultados de partidos</li>
            <li>Estadísticas deportivas</li>
            <li>Ranking</li>
            <li>Historial de participación</li>
            <li>Información necesaria para el correcto funcionamiento de la plataforma</li>
          </ul>
          <p>No solicitamos datos personales sensibles.</p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s3">
          <h2 id="legal-s3" className="legal-page__heading">
            3. Finalidad del tratamiento de los datos
          </h2>
          <p>La información recopilada será utilizada exclusivamente para:</p>
          <ul className="legal-page__list">
            <li>Crear y administrar la cuenta del jugador.</li>
            <li>Registrar resultados deportivos.</li>
            <li>Generar rankings oficiales de Riviera Open.</li>
            <li>Llevar historial deportivo y estadísticas.</li>
            <li>Organizar torneos, retas, ligas y eventos.</li>
            <li>
              Contactar al jugador respecto de torneos, invitaciones, promociones o
              noticias relacionadas únicamente con Riviera Open.
            </li>
            <li>Mejorar nuestros servicios y funcionalidades.</li>
            <li>Brindar soporte técnico y atención al usuario.</li>
          </ul>
          <p>
            Los datos personales no serán utilizados para finalidades distintas a las
            aquí establecidas.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s4">
          <h2 id="legal-s4" className="legal-page__heading">
            4. Protección y confidencialidad de la información
          </h2>
          <p>
            Riviera Open implementa medidas administrativas, técnicas y de seguridad
            razonables para proteger la información de sus usuarios.
          </p>
          <p>Los datos personales serán tratados de manera confidencial.</p>
          <p>
            Riviera Open <strong>no vende, renta, comercializa, distribuye ni comparte
            datos personales con empresas, particulares, anunciantes, patrocinadores o
            cualquier tercero para fines comerciales, publicitarios o ajenos a la
            operación de Riviera Open.</strong>
          </p>
          <p>
            Los datos únicamente podrán ser compartidos cuando exista obligación legal
            o requerimiento emitido por autoridad competente conforme a la legislación
            mexicana.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s5">
          <h2 id="legal-s5" className="legal-page__heading">
            5. Información deportiva pública
          </h2>
          <p>
            Debido a la naturaleza competitiva de Riviera Open, el usuario acepta que
            la siguiente información pueda ser visible dentro de la plataforma y en
            publicaciones oficiales relacionadas con los eventos organizados por Riviera
            Open:
          </p>
          <ul className="legal-page__list">
            <li>Nombre</li>
            <li>Fotografía de perfil</li>
            <li>Categoría</li>
            <li>Club</li>
            <li>Resultados</li>
            <li>Historial deportivo</li>
            <li>Ranking</li>
            <li>Estadísticas</li>
          </ul>
          <p>
            Esta información únicamente tiene fines deportivos y de transparencia en las
            competencias organizadas por Riviera Open.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s6">
          <h2 id="legal-s6" className="legal-page__heading">
            6. Consentimiento del usuario
          </h2>
          <p>
            Al solicitar voluntariamente su registro como jugador en Riviera Open, ya
            sea de manera presencial, verbal o por cualquier otro medio autorizado por
            Riviera Open, el usuario manifiesta expresamente haber leído, comprendido y
            aceptado el presente Aviso de Privacidad y Términos y Condiciones,
            otorgando su consentimiento para el tratamiento de sus datos personales
            conforme a las finalidades aquí descritas.
          </p>
          <p>
            En caso de no estar de acuerdo con el presente documento, el usuario deberá
            abstenerse de solicitar su registro o utilizar la plataforma Riviera Open.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s7">
          <h2 id="legal-s7" className="legal-page__heading">
            7. Derechos ARCO
          </h2>
          <p>El usuario podrá ejercer en cualquier momento sus derechos de:</p>
          <ul className="legal-page__list legal-page__list--inline">
            <li>Acceso</li>
            <li>Rectificación</li>
            <li>Cancelación</li>
            <li>Oposición</li>
          </ul>
          <p>
            Así como solicitar la actualización o eliminación de sus datos personales
            enviando una solicitud al siguiente correo electrónico:
          </p>
          <p className="legal-page__contact-line">
            <a
              className="legal-page__link"
              href="mailto:rivieraopen@gmail.com"
              rel="noopener noreferrer"
            >
              rivieraopen@gmail.com
            </a>
          </p>
          <p>
            Riviera Open atenderá las solicitudes en los plazos previstos por la
            legislación mexicana aplicable.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s8">
          <h2 id="legal-s8" className="legal-page__heading">
            8. Modificaciones
          </h2>
          <p>
            Riviera Open podrá modificar el presente Aviso de Privacidad y Términos y
            Condiciones cuando resulte necesario para mejorar sus servicios, incorporar
            nuevas funcionalidades o dar cumplimiento a disposiciones legales.
          </p>
          <p>
            Las modificaciones entrarán en vigor a partir de su publicación dentro de la
            plataforma.
          </p>
        </section>

        <section className="legal-page__section" aria-labelledby="legal-s9">
          <h2 id="legal-s9" className="legal-page__heading">
            9. Legislación aplicable
          </h2>
          <p>
            El presente documento se rige por la{" "}
            <strong>
              Ley Federal de Protección de Datos Personales en Posesión de los
              Particulares
            </strong>
            , su Reglamento y demás disposiciones legales aplicables en los Estados
            Unidos Mexicanos.
          </p>
          <p>
            Para cualquier controversia relacionada con la interpretación o cumplimiento
            del presente documento, las partes se someten a la jurisdicción de los
            tribunales competentes de la Ciudad de México, renunciando a cualquier otro
            fuero que pudiera corresponderles.
          </p>
        </section>

        <section className="legal-page__section legal-page__section--contact" aria-labelledby="legal-contact">
          <h2 id="legal-contact" className="legal-page__heading">
            Contacto
          </h2>
          <p>
            <strong>Riviera Open</strong>
          </p>
          <p>Ciudad de México, México.</p>
          <p>Correo electrónico:</p>
          <p className="legal-page__contact-line">
            <a
              className="legal-page__link"
              href="mailto:rivieraopen@gmail.com"
              rel="noopener noreferrer"
            >
              rivieraopen@gmail.com
            </a>
          </p>
        </section>
      </article>

      <div className="legal-page__footer-wrap">
        <AppSiteFooter variant="light" />
      </div>
    </main>
  );
};

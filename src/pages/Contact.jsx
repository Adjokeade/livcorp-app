import { useState } from 'react';
import contactService from '../services/contactService';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import contactSupportPhoto from '../assets/images/contact-support.jpg';

const EMPTY_FORM = { name: '', email: '', phone: '', subject: '', message: '' };

export default function Contact() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    setFieldErrors({});
    try {
      await contactService.send(form);
      setSent(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFieldErrors(err.response?.data?.errors ?? {});
      setError(err.response?.data?.message ?? "Impossible d'envoyer votre message. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-extrabold">Contactez-nous</h1>
        <p className="mt-4 text-lg text-on-surface-variant">
          Une question sur une commande, un partenariat ou votre inscription ? Notre équipe vous répond.
        </p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
        {/* Colonne gauche : photo + coordonnées */}
        <div>
          <div className="overflow-hidden rounded-2xl">
            <img
              src={contactSupportPhoto}
              alt="Une conseillère du support client LIV corp, casque sur les oreilles"
              loading="lazy"
              decoding="async"
              className="h-64 w-full object-cover object-[center_12%] sm:h-80 lg:h-[420px]"
            />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-sm font-semibold text-on-surface-variant">Téléphone</p>
              <a href="tel:+2290146620583" className="mt-1 block font-display text-xl font-bold text-primary">
                +229 01 46 62 05 83
              </a>
            </Card>
            <Card>
              <p className="text-sm font-semibold text-on-surface-variant">E-mail</p>
              <a href="mailto:contact@livcorp.bj" className="mt-1 block font-display text-xl font-bold text-primary">
                contact@livcorp.bj
              </a>
            </Card>
          </div>

          <Card className="mt-4">
            <p className="text-sm font-semibold text-on-surface-variant">Zone de service</p>
            <p className="mt-1 text-on-surface">Cotonou et ses environs, Bénin.</p>
          </Card>
        </div>

        {/* Colonne droite : formulaire */}
        <Card>
          <h2 className="font-display text-lg font-bold">Envoyez-nous un message</h2>

          {sent ? (
            <p className="mt-4 rounded bg-primary-fixed px-3 py-2 text-sm text-on-primary-fixed-variant">
              Votre message a bien été envoyé. Notre équipe vous répond au plus vite.
            </p>
          ) : (
            <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
              {error && (
                <p className="rounded bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Nom"
                  required
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  error={fieldErrors.name?.[0]}
                />
                <Input
                  label="Téléphone (optionnel)"
                  type="tel"
                  placeholder="+229 …"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  error={fieldErrors.phone?.[0]}
                />
              </div>
              <Input
                label="E-mail"
                type="email"
                required
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                error={fieldErrors.email?.[0]}
              />
              <Input
                label="Sujet"
                required
                value={form.subject}
                onChange={(e) => update('subject', e.target.value)}
                placeholder="Ex. Question sur ma commande"
                error={fieldErrors.subject?.[0]}
              />
              <div>
                <label htmlFor="message" className="mb-1.5 block text-sm font-semibold text-on-surface">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={5}
                  className="textarea-field"
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                />
                {fieldErrors.message?.[0] && (
                  <p className="mt-1 text-xs font-medium text-error">{fieldErrors.message[0]}</p>
                )}
              </div>

              <Button type="submit" disabled={sending} className="mt-2 w-full">
                {sending ? 'Envoi…' : 'Envoyer'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

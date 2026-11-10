import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Scale, Compass, Calculator, X, RotateCcw, Loader2, MessageSquare } from 'lucide-react';
import { ChatMessage, ChatRoleType } from '../types';

interface DarnaChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DarnaChatbot: React.FC<DarnaChatbotProps> = ({ isOpen, onClose }) => {
  const [roleType, setRoleType] = useState<ChatRoleType>('legal');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      role: 'model',
      text: "Salam ! Je suis votre conseiller immobilier et juridique Darna. Posez-moi vos questions sur la législation locative marocaine (loi 67-12), les contrats de bail, la conformité CNDP, les quartiers ou les estimations de loyer.",
      timestamp: '12:00',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const roleDefinitions = {
    legal: {
      name: 'Expert Juridique & Bail Maroc',
      model: 'gemini-4-argon',
      badge: 'Complexe • Loi 67-12 & CNDP',
      icon: Scale,
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      description: 'Loi n° 67-12, légalisation de bail, caution, litiges et données CNDP.',
      suggestions: [
        'Quel est le montant maximal de la caution au Maroc ?',
        'Quelles sont les formalités de légalisation d\'un contrat de bail ?',
        'Comment fonctionne le préavis de départ pour le locataire ?',
        'Quelles mentions CNDP sont nécessaires pour louer ?'
      ]
    },
    advisor: {
      name: 'Conseiller Quartiers & Recherche',
      model: 'gemini-3.8-flash',
      badge: 'Généraliste • Casablanca, Rabat, Marrakech...',
      icon: Compass,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      description: 'Guide sur les ambiances de quartiers, commodités, transports et sécurité.',
      suggestions: [
        'Quel quartier choisir à Casablanca pour une famille ?',
        'Quelle ambiance à Agdal vs Hay Riad à Rabat ?',
        'Conseils pour trouver un meublé à Marrakech Guéliz',
        'Quels sont les pièges à éviter lors des visites au Maroc ?'
      ]
    },
    estimate: {
      name: 'Estimateur Express de Loyer',
      model: 'gemini-3.1-flash-lite',
      badge: 'Ultra Rapide • Fourchettes MAD',
      icon: Calculator,
      color: 'text-sky-700 bg-sky-50 border-sky-200',
      description: 'Calcul et comparaison express de prix de loyer au m² en Dirhams.',
      suggestions: [
        'Loyer moyen pour un F3 de 90m² à Maarif ?',
        'Estimation pour une villa 4 chambres à la Palmeraie Marrakech',
        'Combien coûte un studio moderne à Tanger Malabata ?'
      ]
    }
  };

  const currentRole = roleDefinitions[roleType];

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({ role: m.role, text: m.text })),
          roleType,
        }),
      });

      const data = await response.json();

      if (data.success && data.text) {
        const modelMsg: ChatMessage = {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, modelMsg]);
      } else {
        throw new Error(data.message || 'Erreur lors de la réponse de l\'assistant.');
      }
    } catch (err: any) {
      console.warn('Chat error fallback:', err);
      // Helpful offline/mock explanation
      let fallbackText = '';
      if (roleType === 'legal') {
        fallbackText = `Au Maroc, selon la **Loi n° 67-12** régissant les rapports entre bailleurs et locataires :\n- La caution (dépôt de garantie) ne peut excéder **2 mois de loyer**.\n- Le bail doit être écrit et impérativement **légalisé auprès de la commune** (Mocata'a).\n- Un état des lieux d'entrée et de sortie est obligatoire pour toute réclamation sur la caution.\n- Conformément aux règles de la **CNDP (Loi 09-08)**, la collecte des pièces d'identité doit se limiter à la signature du bail.`;
      } else if (roleType === 'estimate') {
        fallbackText = `Pour ce type de bien au Maroc, le loyer moyen se situe généralement entre **6 500 MAD et 8 500 MAD / mois** selon le standing de la résidence, la présence d'un ascenseur et d'une place de parking titrée au garage.`;
      } else {
        fallbackText = `Pour votre recherche, privilégiez les axes bien desservis et veillez à visiter le logement en journée pour évaluer la luminosité et les nuisances sonores. Sur Darna, contactez directement le bailleur via le bouton WhatsApp gratuit.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: 'm-reset',
        role: 'model',
        text: `Conversation réinitialisée en mode ${currentRole.name}. Comment puis-je vous aider ?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full h-[85vh] max-h-[750px] flex flex-col overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="px-5 py-4 bg-[#FAF7F2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E3D34] text-amber-300 flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-stone-900">Assistant IA Darna</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {currentRole.model}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Conseiller spécialisé pour le marché immobilier au Maroc
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              title="Réinitialiser l'historique"
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Specialized Role Picker */}
        <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 flex items-center justify-between">
            <span>Rôle & Modèle IA :</span>
            <span className="text-stone-400 font-normal">Changer selon votre besoin</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'legal', label: 'Juridique / Loi 67-12', model: 'gemini-4-argon', icon: Scale },
              { id: 'advisor', label: 'Quartiers / Recherche', model: 'gemini-3.8-flash', icon: Compass },
              { id: 'estimate', label: 'Estimation Loyer', model: 'gemini-3.1-flash-lite', icon: Calculator },
            ].map((r) => {
              const Icon = r.icon;
              const isActive = roleType === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRoleType(r.id as any)}
                  className={`p-2 rounded-xl text-left border transition-all ${
                    isActive
                      ? 'bg-white border-[#C15C3D] shadow-sm ring-1 ring-[#C15C3D]'
                      : 'bg-stone-100/70 border-stone-200 hover:bg-stone-100 text-stone-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#C15C3D]' : 'text-stone-500'}`} />
                    <span className="text-[11px] font-bold truncate">{r.label}</span>
                  </div>
                  <span className="block text-[9px] text-stone-400 truncate mt-0.5">{r.model}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-white">
          {messages.map((m) => {
            const isModel = m.role === 'model';
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isModel ? 'items-start' : 'items-end justify-end'}`}
              >
                {isModel && (
                  <div className="w-8 h-8 rounded-full bg-[#1E3D34] text-white flex items-center justify-center shrink-0 text-xs mt-1">
                    <Bot className="w-4 h-4 text-amber-300" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-sm ${
                    isModel
                      ? 'bg-[#FAF7F2] text-stone-800 border border-stone-200/80 rounded-tl-sm'
                      : 'bg-[#C15C3D] text-white rounded-br-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <span
                    className={`block text-[10px] mt-1 text-right ${
                      isModel ? 'text-stone-400' : 'text-white/70'
                    }`}
                  >
                    {m.timestamp}
                  </span>
                </div>
                {!isModel && (
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center shrink-0 text-xs mb-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 items-center text-stone-400 text-xs py-2">
              <div className="w-8 h-8 rounded-full bg-[#1E3D34] text-amber-300 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <span className="italic">L'assistant {currentRole.model} analyse votre demande...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions chips */}
        <div className="px-4 py-2 bg-stone-50/80 border-t border-stone-200 overflow-x-auto">
          <div className="flex gap-2 text-[11px] whitespace-nowrap">
            {currentRole.suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(s)}
                className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 text-stone-600 hover:text-[#C15C3D] hover:border-[#C15C3D]/50 transition-colors shadow-2xs"
              >
                💡 {s}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-stone-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Posez votre question à ${currentRole.name}...`}
              className="flex-1 text-xs sm:text-sm px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D] bg-stone-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-3 rounded-xl bg-[#C15C3D] hover:bg-[#a94f33] text-white shadow-md transition-all active:scale-95 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-[10px] text-center text-stone-400 mt-2">
            Darna IA respecte votre vie privée et applique les directives de la CNDP marocaine.
          </div>
        </div>
      </div>
    </div>
  );
};

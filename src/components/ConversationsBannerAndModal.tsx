import React, { useState } from 'react';
import {
  MessageSquare,
  Send,
  X,
  Shield,
  Clock,
  Building2,
  ExternalLink,
  CheckCheck,
  Sparkles,
  LogIn,
} from 'lucide-react';
import { ConversationThread, User } from '../types';
import { formatMAD } from '../utils/rentalLogic';

interface ConversationsBannerProps {
  currentUser: User | null;
  conversations: ConversationThread[];
  onOpenConversation: (conversationId?: string) => void;
  onRequireLogin: () => void;
}

export const ConversationsBanner: React.FC<ConversationsBannerProps> = ({
  currentUser,
  conversations,
  onOpenConversation,
  onRequireLogin,
}) => {
  const unreadTotal = currentUser
    ? conversations.reduce((acc, c) => {
        const unreadForUser =
          currentUser.role === 'admin'
            ? Object.values(c.unreadCountByUser || {}).reduce((s, n) => s + n, 0)
            : c.unreadCountByUser?.[currentUser.id] || 0;
        return acc + unreadForUser;
      }, 0)
    : 0;

  return (
    <section
      aria-label="Bannière de conversations Darna"
      className="rounded-3xl bg-gradient-to-r from-[#1E3D34] via-[#24483E] to-[#1E3D34] text-white p-4 sm:p-5 shadow-md border border-[#2C564A]"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Title & Status */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 relative">
            <MessageSquare className="w-5 h-5 text-amber-300" />
            {unreadTotal > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-[#C15C3D] text-white text-[11px] font-extrabold flex items-center justify-center shadow-xs">
                {unreadTotal}
              </span>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                Messagerie Directe Darna
              </span>
              {currentUser?.role === 'admin' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-200 border border-amber-300/30">
                  <Shield className="w-3 h-3" /> Supervision Propriétaire / Admin
                </span>
              )}
              {unreadTotal > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#C15C3D] text-white">
                  {unreadTotal} nouveau{unreadTotal > 1 ? 'x' : ''} message{unreadTotal > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white mt-0.5">
              {currentUser
                ? conversations.length > 0
                  ? `Vos conversations en cours (${conversations.length} discussion${
                      conversations.length > 1 ? 's' : ''
                    })`
                  : 'Aucune conversation active — contactez un annonceur depuis une annonce'
                : 'Échangez directement avec les propriétaires et agences au Maroc sans commission'}
            </h2>
          </div>
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          {currentUser ? (
            <button
              type="button"
              onClick={() => onOpenConversation(conversations[0]?.id)}
              className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Ouvrir mes conversations ({conversations.length})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequireLogin}
              className="px-4 py-2.5 rounded-2xl bg-white hover:bg-stone-100 text-[#1E3D34] font-bold text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <LogIn className="w-4 h-4 text-[#C15C3D]" />
              <span>Se connecter pour accéder aux conversations</span>
            </button>
          )}
        </div>
      </div>

      {/* Horizontal quick-access thread cards when logged in */}
      {currentUser && conversations.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-white/15 grid grid-cols-1 md:grid-cols-2 gap-3">
          {conversations.slice(0, 2).map((conv) => {
            const unreadCount =
              currentUser.role === 'admin'
                ? Object.values(conv.unreadCountByUser || {}).reduce((s, n) => s + n, 0)
                : conv.unreadCountByUser?.[currentUser.id] || 0;

            return (
              <div
                key={conv.id}
                onClick={() => onOpenConversation(conv.id)}
                className="group cursor-pointer rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 p-3 flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {conv.listingImage ? (
                    <img
                      src={conv.listingImage}
                      alt={conv.listingTitle}
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/20"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-amber-300" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        {conv.listingTitle}
                      </span>
                      {unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#C15C3D] text-white shrink-0">
                          Non lu
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-amber-200/90 font-medium truncate">
                      {conv.initiatorName} ↔ {conv.advertiserName}
                    </p>
                    <p className="text-xs text-stone-200 truncate mt-0.5">
                      « {conv.lastMessageText} »
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-white/15 group-hover:bg-amber-400 group-hover:text-stone-950 text-white text-[11px] font-bold shrink-0 transition-colors">
                  Répondre
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

interface ConversationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  conversations: ConversationThread[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onSendMessage: (conversationId: string, text: string) => Promise<void>;
  onOpenListingById?: (listingId: string) => void;
}

export const ConversationsModal: React.FC<ConversationsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  conversations,
  activeConversationId,
  onSelectConversation,
  onSendMessage,
  onOpenListingById,
}) => {
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!isOpen || !currentUser) return null;

  const activeThread =
    conversations.find((c) => c.id === activeConversationId) || conversations[0] || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !replyText.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(activeThread.id, replyText.trim());
      setReplyText('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversations-modal-title"
        className="relative bg-white rounded-3xl shadow-2xl max-w-4xl w-full h-[82vh] max-h-[720px] flex flex-col overflow-hidden border border-stone-200"
      >
        {/* Top Header with X close button on top right */}
        <div className="px-5 py-4 bg-[#FAF7F2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E3D34] text-amber-300 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="conversations-modal-title"
                  className="text-base sm:text-lg font-bold text-stone-900"
                >
                  Conversations & Messagerie Darna
                </h2>
                {currentUser.role === 'admin' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-900 text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Mode Propriétaire / Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Connecté en tant que <strong>{currentUser.name}</strong> ({currentUser.email})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les conversations"
            className="w-9 h-9 rounded-full bg-white hover:bg-stone-200 text-stone-600 hover:text-stone-950 flex items-center justify-center border border-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main 2-column content */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Left column: Threads list */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-stone-200 overflow-y-auto bg-stone-50/60">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500">
                Aucune conversation pour le moment. Ouvrez une annonce pour envoyer un message à un propriétaire.
              </div>
            ) : (
              <div className="divide-y divide-stone-200/80">
                {conversations.map((conv) => {
                  const isSelected = activeThread?.id === conv.id;
                  const unread = conv.unreadCountByUser?.[currentUser.id] || 0;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => onSelectConversation(conv.id)}
                      className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                        isSelected
                          ? 'bg-white border-l-4 border-l-[#C15C3D] shadow-2xs'
                          : 'hover:bg-white/70'
                      }`}
                    >
                      {conv.listingImage ? (
                        <img
                          src={conv.listingImage}
                          alt={conv.listingTitle}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-stone-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-stone-200 flex items-center justify-center shrink-0">
                          <Building2 className="w-5 h-5 text-stone-500" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-stone-900 truncate">
                            {conv.listingTitle}
                          </span>
                          {unread > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#C15C3D] text-white text-[10px] font-bold">
                              {unread}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-[#1E3D34] truncate">
                          {conv.advertiserName} • {formatMAD(conv.listingPrice, 'mois')}
                        </p>
                        <p className="text-xs text-stone-500 truncate mt-0.5">
                          {conv.lastMessageText}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column: Active conversation messages */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {activeThread ? (
              <>
                {/* Thread Property Bar */}
                <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 bg-stone-50/40">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                      {activeThread.listingTitle} ({activeThread.listingCity})
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Participants : {activeThread.initiatorName} & {activeThread.advertiserName}
                    </p>
                  </div>
                  {onOpenListingById && (
                    <button
                      type="button"
                      onClick={() => onOpenListingById(activeThread.listingId)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-[#1E3D34] border border-stone-200 text-xs font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#C15C3D]" />
                      <span>Voir l'annonce</span>
                    </button>
                  )}
                </div>

                {/* Messages stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF7F2]/50">
                  {activeThread.messages.map((msg) => {
                    const isMine = msg.senderId === currentUser.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs ${
                            isMine
                              ? 'bg-[#1E3D34] text-white rounded-br-xs'
                              : 'bg-white text-stone-800 border border-stone-200 rounded-bl-xs'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`font-bold text-[11px] ${
                                isMine ? 'text-amber-300' : 'text-[#C15C3D]'
                              }`}
                            >
                              {msg.senderName}
                            </span>
                            {msg.senderRole === 'admin' && (
                              <span className="px-1.5 py-0.2 rounded-sm bg-amber-400/20 text-amber-200 text-[9px] font-bold">
                                Admin
                              </span>
                            )}
                          </div>
                          <p>{msg.text}</p>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-stone-400 mt-1 px-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isMine && <CheckCheck className="w-3 h-3 text-emerald-600" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply Input Bar */}
                <form
                  onSubmit={handleSubmit}
                  className="p-3.5 bg-white border-t border-stone-200 flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Écrivez votre message ou réponse ici..."
                    className="flex-1 text-xs sm:text-sm px-4 py-2.5 rounded-2xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#1E3D34] bg-stone-50 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || isSending}
                    className="px-4 py-2.5 rounded-2xl bg-[#C15C3D] hover:bg-[#a94f33] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Envoyer</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-xs text-stone-500">
                Sélectionnez une conversation à gauche pour afficher les messages.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

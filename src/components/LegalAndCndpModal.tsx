import React from 'react';
import { X, ShieldCheck, Scale, FileText, CheckCircle2 } from 'lucide-react';

interface LegalAndCndpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalAndCndpModal: React.FC<LegalAndCndpModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="px-6 py-5 bg-[#FAF7F2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1E3D34] text-white flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-stone-900">Cadre Légal & Conformité CNDP au Maroc</h3>
              <p className="text-xs text-stone-500">Protection des données personnelles et règles du bail locatif</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-stone-700 leading-relaxed">
          {/* CNDP Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4>1. Protection des Données Personnelles (Loi n° 09-08 / CNDP)</h4>
            </div>
            <p>
              Conformément à la loi marocaine n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel, la plateforme <strong>Darna</strong> applique des normes strictes de minimisation et de confidentialité des données :
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-stone-600">
              <li>
                <strong>Masquage à discrétion :</strong> Tout annonceur peut choisir de masquer son numéro de téléphone ou son adresse exacte aux simples visiteurs.
              </li>
              <li>
                <strong>Aucune revente de données :</strong> Vos coordonnées ne sont jamais cédées ni vendues à des courtiers tiers.
              </li>
              <li>
                <strong>Droit d'accès et de rectification :</strong> Vous pouvez à tout moment demander la modification ou la suppression complète de vos données en écrivant à <em>dpo@darna.ma</em>.
              </li>
              <li>
                <strong>Vérification formelle CNDP :</strong> Avant le déploiement commercial public, le dossier de déclaration de traitement de données sera soumis formellement à la CNDP.
              </li>
            </ul>
          </div>

          {/* Loi 67-12 Section */}
          <div className="space-y-3 pt-4 border-t border-stone-200">
            <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
              <FileText className="w-4 h-4 text-[#C15C3D]" />
              <h4>2. Législation du Bail d'Habitation au Maroc (Loi n° 67-12)</h4>
            </div>
            <p>
              La plateforme Darna met en relation directe propriétaires et locataires sans intermédiaire financier. Les transactions doivent respecter scrupuleusement la loi 67-12 :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">Contrat de bail écrit & légalisé</span>
                <span className="text-stone-600">
                  Le contrat doit être rédigé par écrit et légalisé à l'arrondissement communal (Mocata'a).
                </span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">Plafond de caution légale</span>
                <span className="text-stone-600">
                  Le dépôt de garantie ne peut légalement excéder <strong>2 mois de loyer</strong> hors charges.
                </span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">État des lieux contradictoire</span>
                <span className="text-stone-600">
                  Obligatoire à l'entrée et à la sortie pour toute déduction sur la caution.
                </span>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">Révision du loyer</span>
                <span className="text-stone-600">
                  Plafonnée légalement (généralement 8% à 10% tous les 3 ans).
                </span>
              </div>
            </div>
          </div>

          {/* Fraud prevention tips */}
          <div className="space-y-3 pt-4 border-t border-stone-200 bg-amber-50 p-4 rounded-2xl border border-amber-200">
            <h4 className="font-bold text-amber-900 text-xs uppercase tracking-wider">
              Règles d'or anti-fraude pour louer en toute sérénité au Maroc :
            </h4>
            <div className="space-y-1.5 text-amber-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Ne versez JAMAIS d'argent ni de mandat avant d'avoir visité physiquement le bien.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Exigez une preuve de propriété (titre foncier, quittance) ou le mandat officiel de l'agence.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Signalez immédiatement toute annonce suspecte via le bouton de signalement Darna.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#FAF7F2] border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#1E3D34] text-white text-xs font-bold rounded-xl hover:bg-[#152c25] transition-colors"
          >
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
};

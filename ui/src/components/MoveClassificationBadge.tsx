import React from 'react';
import Image from 'next/image';

export type MoveClassification =
    | 'brilliant'
    | 'great'
    | 'best'
    | 'book'
    | 'excellent'
    | 'good'
    | 'inaccuracy'
    | 'mistake'
    | 'blunder'
    | 'incorrect'
    | 'miss';

interface MoveClassificationBadgeProps {
    classification: MoveClassification;
    inline?: boolean;
}

const classificationStyles: Record<MoveClassification, { bg: string; text: string; icon: string; title: string }> = {
    brilliant: {
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        icon: '/svg/brilliant.svg',
        title: 'Brilliant move'
    },
    great: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        icon: '/svg/great_find.svg',
        title: 'Great move'
    },
    best: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        icon: '/svg/best.svg',
        title: 'Best move'
    },
    book: {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        icon: '/svg/book.svg',
        title: 'Book move'
    },
    excellent: {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        icon: '/svg/excellent.svg',
        title: 'Excellent move'
    },
    good: {
        bg: 'bg-gray-100',
        text: 'text-gray-600',
        icon: '/svg/good.svg',
        title: 'Good move'
    },
    inaccuracy: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        icon: '/svg/inaccuracy.svg',
        title: 'Inaccuracy'
    },
    mistake: {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        icon: '/svg/mistake.svg',
        title: 'Mistake'
    },
    blunder: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: '/svg/blunder.svg',
        title: 'Blunder'
    },
    incorrect: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: '/svg/incorrect.svg',
        title: 'Incorrect'
    },
    miss: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: '/svg/miss.svg',
        title: 'Miss'
    }
};

export const MoveClassificationBadge: React.FC<MoveClassificationBadgeProps> = ({
    classification,
    inline = true
}) => {
    const style = classificationStyles[classification];

    if (!style) return null;

    if (inline) {
        // Inline badge - just the icon
        return (
            <span
                className="inline-flex items-center justify-center"
                title={style.title}
            >
                <Image
                    src={style.icon}
                    alt={style.title}
                    width={20}
                    height={20}
                    className="w-5 h-5"
                />
            </span>
        );
    }

    // Full badge with background
    return (
        <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} gap-1`}
            title={style.title}
        >
            <Image
                src={style.icon}
                alt={style.title}
                width={16}
                height={16}
                className="w-4 h-4"
            />
            <span>{style.title}</span>
        </span>
    );
};

export default MoveClassificationBadge;

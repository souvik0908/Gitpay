'use client'

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bug } from 'lucide-react'; // Added Bug icon
import Link from 'next/link';

const ActiveBounties = () => {
  // Dummy data for active bounties
  const [bounties, setBounties] = useState([
    {
      id: 1,
      title: 'Fix EIP-3009 signature validation edge-case',
      repo: 'souvik0908/gitpay',
      amount: '50 USDC',
      status: 'Open',
      tags: ['Blockchain', 'EIP-712'],
      fundedTxHash: 'mockTx123',
      issueNumber: 1, // Added issueNumber
    },
    {
      id: 2,
      title: 'Implement Dispute Resolution UI (MVP)',
      repo: 'souvik0908/gitpay',
      amount: '100 USDC',
      status: 'Open',
      tags: ['Next.js', 'UI'],
      fundedTxHash: 'mockTx456',
      issueNumber: 2, // Added issueNumber
    },
    {
      id: 3,
      title: 'Optimize facilitator payment handshake (402)',
      repo: 'souvik0908/gitpay',
      amount: '20 USDC',
      status: 'Open',
      tags: ['x402', 'Backend'],
      fundedTxHash: 'mockTx789',
      issueNumber: 3, // Added issueNumber
    },
  ]);

  const [loading, setLoading] = useState(false); // Set loading state

  // Mimic loading state for 2 seconds
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 2000); // Change the timeout value to control how long the loading state lasts
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-16">
      <h1 className="text-center text-3xl font-bold mb-6">Active Bounties</h1>
      
      {/* Cards for active bounties */}
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {bounties.map((bounty) => (
          <Card key={bounty.id} className="rounded-3xl transition hover:shadow-md bg-white dark:bg-gray-800">
            <CardHeader>
              <div className="flex justify-between items-center">
                <Badge variant={bounty.status === 'Funded' ? 'default' : 'secondary'}>
                  {bounty.status}
                </Badge>
                <span className="text-sm font-semibold">{bounty.amount}</span>
              </div>
              <CardTitle className="mt-4 line-clamp-2">{bounty.title}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Bug className="h-3.5 w-3.5" />
                <span className="truncate">{bounty.repo}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {bounty.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-xs">
                  {t}
                </Badge>
              ))}
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                {/* Construct GitHub Issue URL dynamically */}
                <Link href={`https://github.com/${bounty.repo}/issues/${bounty.issueNumber}`} target="_blank">
                  View Bug
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ActiveBounties;

package com.claimshield.core.service;

/** Synthetic X12 835 remittance used by the parser and API tests (same sample as the retired Python tests). */
public final class Edi835ParserServiceTestFixtures {

    private Edi835ParserServiceTestFixtures() {}

    public static final String SAMPLE_835 =
            "ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *231015*1200*^*00501*000000001*0*P*:~"
            + "GS*HP*SENDER*RECEIVER*20231015*1200*1*X*005010X221A1~"
            + "ST*835*0001~"
            + "BPR*I*1500.00*C*CHK************20231015~"
            + "TRN*1*TRACE123*1234567890~"
            + "N1*PR*Aetna Insurance~"
            + "N1*PE*Synthetic Medical Group~"
            + "CLP*CLM-001*1*2500.00*1500.00*500.00*MC~"
            + "NM1*QC*1*DOE*JOHN~"
            + "SVC*HC:99214*250.00*150.00~"
            + "CAS*CO*50*100.00*0~"
            + "DTM*472*20230901~"
            + "LQ*HE*N115~"
            + "SVC*HC:99213:59*200.00*0.00~"
            + "CAS*CO*97*200.00*1~"
            + "DTM*472*20230901~"
            + "SE*15*0001~"
            + "GE*1*1~"
            + "IEA*1*000000001~";
}
